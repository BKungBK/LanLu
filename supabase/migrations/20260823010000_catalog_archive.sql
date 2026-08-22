alter table public.ingredients add column if not exists active boolean not null default true;
alter table public.menu_items add column if not exists archived_at timestamptz;
alter table public.recipes add column if not exists archived_at timestamptz;

create index if not exists recipes_active_menu_version_idx
  on public.recipes(shop_id, menu_item_id, version desc)
  where archived_at is null;

create or replace function public.archive_catalog_item(
  target_shop_id uuid,
  target_kind text,
  target_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  before_row jsonb;
  after_row jsonb;
begin
  if not public.is_shop_member(target_shop_id) then raise exception 'shop_access_denied'; end if;

  if target_kind = 'ingredient' then
    select to_jsonb(i) into before_row
    from public.ingredients i
    where i.id = target_id and i.shop_id = target_shop_id
    for update;
    if before_row is null then raise exception 'ingredient_not_found'; end if;
    if coalesce((before_row->>'active')::boolean, true) = false then return; end if;
    update public.ingredients set active = false, updated_at = now()
    where id = target_id and shop_id = target_shop_id
    returning to_jsonb(ingredients.*) into after_row;
  elsif target_kind = 'menu' then
    select to_jsonb(m) into before_row
    from public.menu_items m
    where m.id = target_id and m.shop_id = target_shop_id
    for update;
    if before_row is null then raise exception 'menu_item_not_found'; end if;
    if before_row->>'archived_at' is not null then return; end if;
    update public.menu_items set active = false, archived_at = now(), updated_at = now()
    where id = target_id and shop_id = target_shop_id
    returning to_jsonb(menu_items.*) into after_row;
  else
    raise exception 'catalog_kind_invalid';
  end if;

  insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, before_data, after_data, created_by)
  values (target_shop_id, target_kind, target_id, 'archive', before_row, after_row, auth.uid());
end;
$$;

create or replace function public.archive_recipe(
  target_shop_id uuid,
  target_menu_item_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  recipe_id uuid;
  before_row jsonb;
  after_row jsonb;
begin
  if not public.is_shop_member(target_shop_id) then raise exception 'shop_access_denied'; end if;

  select to_jsonb(r), r.id into before_row, recipe_id
  from public.recipes r
  where r.shop_id = target_shop_id
    and r.menu_item_id = target_menu_item_id
    and r.archived_at is null
  order by r.version desc
  limit 1
  for update;
  if recipe_id is null then raise exception 'recipe_not_found'; end if;

  update public.recipes set archived_at = now()
  where id = recipe_id
  returning to_jsonb(recipes.*) into after_row;

  insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, before_data, after_data, created_by)
  values (target_shop_id, 'recipe', recipe_id, 'archive', before_row, after_row, auth.uid());
end;
$$;

create or replace function public.record_sales_batch(
  target_shop_id uuid,
  business_date date,
  occurred_at timestamptz,
  order_count integer,
  sale_lines jsonb,
  idempotency_key text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  transaction_id uuid;
  line record;
  recipe_line record;
  lot record;
  latest_recipe_id uuid;
  remaining numeric;
  allocation numeric;
  movement_key text;
begin
  if not public.is_shop_member(target_shop_id) then raise exception 'shop_access_denied'; end if;
  select id into transaction_id from public.sales_transactions where shop_id = target_shop_id and sales_transactions.idempotency_key = record_sales_batch.idempotency_key;
  if transaction_id is not null then return transaction_id; end if;
  if not exists (select 1 from jsonb_to_recordset(coalesce(sale_lines, '[]'::jsonb)) as input_line(menu_item_id uuid, quantity integer) where input_line.quantity > 0) then raise exception 'sale_requires_line'; end if;

  insert into public.sales_transactions (shop_id, business_date, occurred_at, order_count, idempotency_key, created_by)
  values (target_shop_id, business_date, coalesce(occurred_at, now()), order_count, idempotency_key, auth.uid())
  returning id into transaction_id;
  for line in select input_line.menu_item_id, input_line.quantity from jsonb_to_recordset(sale_lines) as input_line(menu_item_id uuid, quantity integer) where input_line.quantity > 0 loop
    select r.id into latest_recipe_id
    from public.recipes r
    where r.shop_id = target_shop_id and r.menu_item_id = line.menu_item_id and r.archived_at is null
    order by r.version desc limit 1;
    insert into public.sales_lines (shop_id, sales_transaction_id, menu_item_id, quantity, price_snapshot, cogs_snapshot, created_by)
    select target_shop_id, transaction_id, mi.id, line.quantity, mi.price,
      coalesce((select sum(rl.quantity * i.unit_cost) from public.recipe_lines rl join public.ingredients i on i.id = rl.ingredient_id where rl.recipe_id = latest_recipe_id), 0),
      auth.uid()
    from public.menu_items mi where mi.id = line.menu_item_id and mi.shop_id = target_shop_id and mi.active;
    if not found then raise exception 'menu_item_not_found'; end if;
    if latest_recipe_id is not null then
      for recipe_line in select rl.ingredient_id, rl.quantity * line.quantity as used_quantity from public.recipe_lines rl where rl.recipe_id = latest_recipe_id loop
        remaining := recipe_line.used_quantity; movement_key := idempotency_key || ':' || line.menu_item_id || ':' || recipe_line.ingredient_id;
        for lot in select id, quantity_remaining from public.inventory_lots where shop_id = target_shop_id and ingredient_id = recipe_line.ingredient_id and quantity_remaining > 0 order by expires_on is null, expires_on, created_at for update loop
          exit when remaining <= 0; allocation := least(remaining, lot.quantity_remaining);
          update public.inventory_lots set quantity_remaining = quantity_remaining - allocation, updated_at = now() where id = lot.id;
          insert into public.inventory_movements (shop_id, ingredient_id, lot_id, type, quantity, occurred_at, source, note, idempotency_key, created_by) values (target_shop_id, recipe_line.ingredient_id, lot.id, 'consumption', allocation, coalesce(occurred_at, now()), 'sale', 'ตัดจากยอดขาย', movement_key, auth.uid()) on conflict (shop_id, idempotency_key) do nothing;
          remaining := remaining - allocation; movement_key := movement_key || ':' || lot.id;
        end loop;
        if remaining > 0 then insert into public.inventory_movements (shop_id, ingredient_id, type, quantity, occurred_at, source, note, idempotency_key, created_by) values (target_shop_id, recipe_line.ingredient_id, 'consumption', remaining, coalesce(occurred_at, now()), 'sale', 'ตัดจากยอดขาย', movement_key, auth.uid()) on conflict (shop_id, idempotency_key) do nothing; end if;
      end loop;
    end if;
  end loop;
  return transaction_id;
end;
$$;

grant execute on function public.archive_catalog_item(uuid, text, uuid) to authenticated;
grant execute on function public.archive_recipe(uuid, uuid) to authenticated;
