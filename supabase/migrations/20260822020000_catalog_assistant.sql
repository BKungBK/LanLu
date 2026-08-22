alter table public.ingredients add column if not exists supplier text;

create table if not exists public.catalog_audit_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  entity_type text not null check (entity_type in ('ingredient', 'menu', 'recipe', 'import')),
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_import_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind text not null check (kind in ('ingredient', 'menu', 'recipe')),
  idempotency_key text not null,
  conflict_mode text not null check (conflict_mode in ('create', 'update', 'skip')),
  status text not null default 'completed' check (status in ('completed', 'failed')),
  row_count integer not null default 0,
  error_message text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (shop_id, idempotency_key)
);

create index if not exists catalog_audit_events_shop_created_idx on public.catalog_audit_events(shop_id, created_at desc);

alter table public.catalog_audit_events enable row level security;
alter table public.catalog_import_batches enable row level security;
create policy catalog_audit_events_member on public.catalog_audit_events for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id) and created_by = auth.uid());
create policy catalog_import_batches_member on public.catalog_import_batches for all using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id) and created_by = auth.uid());

create or replace function public.update_catalog_master(
  target_shop_id uuid,
  target_kind text,
  target_id uuid,
  payload jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  before_row jsonb;
  after_row jsonb;
  new_category_id uuid;
begin
  if not public.is_shop_member(target_shop_id) then raise exception 'shop_access_denied'; end if;
  if target_kind = 'ingredient' then
    select to_jsonb(i) into before_row from public.ingredients i where i.id = target_id and i.shop_id = target_shop_id for update;
    if before_row is null then raise exception 'ingredient_not_found'; end if;
    update public.ingredients set
      name = coalesce(nullif(trim(payload->>'name'), ''), name),
      unit = coalesce(nullif(trim(payload->>'unit'), ''), unit),
      supplier = case when payload ? 'supplier' then nullif(trim(payload->>'supplier'), '') else supplier end,
      reorder_point = case when payload ? 'reorderPoint' then (payload->>'reorderPoint')::numeric else reorder_point end,
      unit_cost = case when payload ? 'unitCost' then (payload->>'unitCost')::numeric else unit_cost end,
      updated_at = now()
    where id = target_id and shop_id = target_shop_id
    returning to_jsonb(ingredients.*) into after_row;
  elsif target_kind = 'menu' then
    select to_jsonb(m) into before_row from public.menu_items m where m.id = target_id and m.shop_id = target_shop_id for update;
    if before_row is null then raise exception 'menu_item_not_found'; end if;
    if payload ? 'category' then
      select id into new_category_id from public.menu_categories where shop_id = target_shop_id and name = nullif(trim(payload->>'category'), '');
      if new_category_id is null then
        insert into public.menu_categories (shop_id, name, created_by) values (target_shop_id, trim(payload->>'category'), auth.uid()) returning id into new_category_id;
      end if;
    end if;
    update public.menu_items set
      name = coalesce(nullif(trim(payload->>'name'), ''), name),
      category_id = case when payload ? 'category' then new_category_id else public.menu_items.category_id end,
      price = case when payload ? 'price' then (payload->>'price')::numeric else price end,
      active = case when payload ? 'active' then (payload->>'active')::boolean else active end,
      updated_at = now()
    where id = target_id and shop_id = target_shop_id
    returning to_jsonb(menu_items.*) into after_row;
  else
    raise exception 'catalog_kind_invalid';
  end if;

  insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, before_data, after_data, created_by)
  values (target_shop_id, target_kind, target_id, 'update', before_row, after_row, auth.uid());
end;
$$;

create or replace function public.bulk_import_catalog(
  target_shop_id uuid,
  import_kind text,
  import_rows jsonb,
  idempotency_key text,
  conflict_mode text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  batch_id uuid;
  row_data jsonb;
  entity_id uuid;
  category_id uuid;
  ingredient_id uuid;
  menu_id uuid;
  recipe_id uuid;
  current_menu_id uuid;
  next_version integer;
  imported integer := 0;
  existing_id uuid;
begin
  if not public.is_shop_member(target_shop_id) then raise exception 'shop_access_denied'; end if;
  if target_shop_id is null or jsonb_array_length(coalesce(import_rows, '[]'::jsonb)) = 0 then raise exception 'import_requires_rows'; end if;
  if import_kind not in ('ingredient', 'menu', 'recipe') then raise exception 'catalog_kind_invalid'; end if;
  if conflict_mode not in ('create', 'update', 'skip') then raise exception 'conflict_mode_invalid'; end if;

  select id into batch_id from public.catalog_import_batches where shop_id = target_shop_id and catalog_import_batches.idempotency_key = bulk_import_catalog.idempotency_key;
  if batch_id is not null then return jsonb_build_object('batchId', batch_id, 'replayed', true); end if;
  insert into public.catalog_import_batches (shop_id, kind, idempotency_key, conflict_mode, row_count, created_by) values (target_shop_id, import_kind, idempotency_key, conflict_mode, jsonb_array_length(import_rows), auth.uid()) returning id into batch_id;

  for row_data in select value from jsonb_array_elements(import_rows)
  loop
    if import_kind = 'ingredient' then
      if nullif(trim(row_data->>'name'), '') is null or nullif(trim(row_data->>'unit'), '') is null then raise exception 'import_required_field'; end if;
      select id into existing_id from public.ingredients where shop_id = target_shop_id and lower(name) = lower(trim(row_data->>'name')) limit 1;
      if existing_id is not null and conflict_mode = 'skip' then continue; end if;
      if existing_id is not null and conflict_mode = 'update' then
        perform public.update_catalog_master(target_shop_id, 'ingredient', existing_id, row_data);
      elsif existing_id is null then
        insert into public.ingredients (shop_id, name, unit, supplier, reorder_point, unit_cost, created_by) values (target_shop_id, trim(row_data->>'name'), trim(row_data->>'unit'), nullif(trim(row_data->>'supplier'), ''), coalesce(nullif(row_data->>'reorderPoint', '')::numeric, 0), coalesce(nullif(row_data->>'unitCost', '')::numeric, 0), auth.uid()) returning id into ingredient_id;
        insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, after_data, created_by) values (target_shop_id, 'ingredient', ingredient_id, 'import_create', row_data, auth.uid());
        if coalesce(nullif(row_data->>'quantityOnHand', '')::numeric, 0) > 0 then
          perform public.post_inventory_movement(target_shop_id, ingredient_id, 'receipt', (row_data->>'quantityOnHand')::numeric, now(), 'ยอดเริ่มต้นจาก CSV import', idempotency_key || ':receipt:' || ingredient_id, null, nullif(row_data->>'expiresOn', '')::date, coalesce(nullif(row_data->>'unitCost', '')::numeric, 0), null);
        end if;
      else
        continue;
      end if;
    elsif import_kind = 'menu' then
      if nullif(trim(row_data->>'name'), '') is null then raise exception 'import_required_field'; end if;
      select id into category_id from public.menu_categories where shop_id = target_shop_id and name = coalesce(nullif(trim(row_data->>'category'), ''), 'อื่น ๆ');
      if category_id is null then insert into public.menu_categories (shop_id, name, created_by) values (target_shop_id, coalesce(nullif(trim(row_data->>'category'), ''), 'อื่น ๆ'), auth.uid()) returning id into category_id; end if;
      select id into existing_id from public.menu_items where shop_id = target_shop_id and lower(name) = lower(trim(row_data->>'name')) limit 1;
      if existing_id is not null and conflict_mode = 'skip' then continue; end if;
      if existing_id is not null and conflict_mode = 'update' then perform public.update_catalog_master(target_shop_id, 'menu', existing_id, row_data || jsonb_build_object('category', coalesce(nullif(trim(row_data->>'category'), ''), 'อื่น ๆ')));
      elsif existing_id is null then
        insert into public.menu_items (shop_id, category_id, name, price, active, created_by) values (target_shop_id, category_id, trim(row_data->>'name'), coalesce(nullif(row_data->>'price', '')::numeric, 0), coalesce((row_data->>'active')::boolean, true), auth.uid()) returning id into menu_id;
        insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, after_data, created_by) values (target_shop_id, 'menu', menu_id, 'import_create', row_data, auth.uid());
      else continue;
      end if;
    else
      select mi.id into menu_id from public.menu_items mi where mi.shop_id = target_shop_id and lower(mi.name) = lower(trim(row_data->>'menuName')) limit 1;
      select i.id into ingredient_id from public.ingredients i where i.shop_id = target_shop_id and lower(i.name) = lower(trim(row_data->>'ingredientName')) limit 1;
      if menu_id is null or ingredient_id is null or coalesce(nullif(row_data->>'quantity', '')::numeric, 0) <= 0 then raise exception 'import_reference_not_found'; end if;
      if current_menu_id is distinct from menu_id then
        current_menu_id := menu_id;
        recipe_id := null;
        select coalesce(max(version), 0) + 1 into next_version from public.recipes where shop_id = target_shop_id and menu_item_id = menu_id;
        insert into public.recipes (shop_id, menu_item_id, version, created_by) values (target_shop_id, menu_id, next_version, auth.uid()) returning id into recipe_id;
      end if;
      insert into public.recipe_lines (shop_id, recipe_id, ingredient_id, quantity, created_by) values (target_shop_id, recipe_id, ingredient_id, (row_data->>'quantity')::numeric, auth.uid()) on conflict (recipe_id, ingredient_id) do update set quantity = excluded.quantity, updated_at = now();
      insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, after_data, created_by) values (target_shop_id, 'recipe', recipe_id, 'import_create_version', row_data, auth.uid());
    end if;
    imported := imported + 1;
  end loop;
  update public.catalog_import_batches set row_count = imported where id = batch_id;
  return jsonb_build_object('batchId', batch_id, 'imported', imported, 'replayed', false);
exception when others then
  if batch_id is not null then update public.catalog_import_batches set status = 'failed', error_message = sqlerrm where id = batch_id; end if;
  raise;
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

  insert into public.sales_transactions (shop_id, business_date, occurred_at, order_count, idempotency_key, created_by) values (target_shop_id, business_date, coalesce(occurred_at, now()), order_count, idempotency_key, auth.uid()) returning id into transaction_id;
  for line in select input_line.menu_item_id, input_line.quantity from jsonb_to_recordset(sale_lines) as input_line(menu_item_id uuid, quantity integer) where input_line.quantity > 0 loop
    select r.id into latest_recipe_id from public.recipes r where r.shop_id = target_shop_id and r.menu_item_id = line.menu_item_id order by r.version desc limit 1;
    insert into public.sales_lines (shop_id, sales_transaction_id, menu_item_id, quantity, price_snapshot, cogs_snapshot, created_by)
    select target_shop_id, transaction_id, mi.id, line.quantity, mi.price, coalesce((select sum(rl.quantity * i.unit_cost) from public.recipe_lines rl join public.ingredients i on i.id = rl.ingredient_id where rl.recipe_id = latest_recipe_id), 0), auth.uid()
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

grant execute on function public.update_catalog_master(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.bulk_import_catalog(uuid, text, jsonb, text, text) to authenticated;
grant execute on function public.record_sales_batch(uuid, date, timestamptz, integer, jsonb, text) to authenticated;
