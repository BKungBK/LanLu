alter table public.inventory_movements
  add column if not exists adjustment_delta numeric(14,3);

create or replace function public.create_shop_with_defaults(
  shop_name text,
  shop_owner_name text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_shop_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.shop_members where user_id = auth.uid()) then
    raise exception 'shop_already_exists';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), nullif(trim(shop_owner_name), ''))
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, profiles.display_name),
    updated_at = now();

  insert into public.shops (name, owner_name, created_by)
  values (coalesce(nullif(trim(shop_name), ''), 'ร้านของฉัน'), nullif(trim(shop_owner_name), ''), auth.uid())
  returning id into new_shop_id;

  insert into public.shop_members (shop_id, user_id, role)
  values (new_shop_id, auth.uid(), 'owner');

  insert into public.menu_categories (shop_id, name, created_by)
  values
    (new_shop_id, 'กาแฟ', auth.uid()),
    (new_shop_id, 'ชา', auth.uid()),
    (new_shop_id, 'อื่น ๆ', auth.uid());

  return new_shop_id;
end;
$$;

create or replace function public.save_recipe(
  target_shop_id uuid,
  target_menu_item_id uuid,
  recipe_lines jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_recipe_id uuid;
  next_version integer;
begin
  if not public.is_shop_member(target_shop_id) then
    raise exception 'shop_access_denied';
  end if;
  if not exists (select 1 from public.menu_items where id = target_menu_item_id and shop_id = target_shop_id) then
    raise exception 'menu_item_not_found';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(recipe_lines, '[]'::jsonb)) as input_line(ingredient_id uuid, quantity numeric)
    where not exists (select 1 from public.ingredients i where i.id = input_line.ingredient_id and i.shop_id = target_shop_id)
  ) then
    raise exception 'ingredient_access_denied';
  end if;

  if jsonb_array_length(coalesce(recipe_lines, '[]'::jsonb)) = 0 then
    raise exception 'recipe_requires_line';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.recipes
  where shop_id = target_shop_id and menu_item_id = target_menu_item_id;

  insert into public.recipes (shop_id, menu_item_id, version, created_by)
  values (target_shop_id, target_menu_item_id, next_version, auth.uid())
  returning id into new_recipe_id;

  insert into public.recipe_lines (shop_id, recipe_id, ingredient_id, quantity, created_by)
  select target_shop_id, new_recipe_id, line.ingredient_id, line.quantity, auth.uid()
  from jsonb_to_recordset(recipe_lines) as line(ingredient_id uuid, quantity numeric)
  where line.quantity > 0;

  if not exists (select 1 from public.recipe_lines where recipe_id = new_recipe_id) then
    raise exception 'recipe_requires_line';
  end if;

  return new_recipe_id;
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
  if not public.is_shop_member(target_shop_id) then
    raise exception 'shop_access_denied';
  end if;
  if not exists (select 1 from public.ingredients where id = target_ingredient_id and shop_id = target_shop_id) then
    raise exception 'ingredient_access_denied';
  end if;

  select id into transaction_id
  from public.sales_transactions
  where shop_id = target_shop_id and sales_transactions.idempotency_key = record_sales_batch.idempotency_key;

  if transaction_id is not null then
    return transaction_id;
  end if;

  if not exists (
    select 1 from jsonb_to_recordset(coalesce(sale_lines, '[]'::jsonb)) as input_line(menu_item_id uuid, quantity integer)
    where input_line.quantity > 0
  ) then
    raise exception 'sale_requires_line';
  end if;

  insert into public.sales_transactions (shop_id, business_date, occurred_at, order_count, idempotency_key, created_by)
  values (target_shop_id, business_date, coalesce(occurred_at, now()), order_count, idempotency_key, auth.uid())
  returning id into transaction_id;

  for line in
    select input_line.menu_item_id, input_line.quantity
    from jsonb_to_recordset(sale_lines) as input_line(menu_item_id uuid, quantity integer)
    where input_line.quantity > 0
  loop
    select r.id into latest_recipe_id
    from public.recipes r
    where r.shop_id = target_shop_id and r.menu_item_id = line.menu_item_id
    order by r.version desc
    limit 1;

    insert into public.sales_lines (shop_id, sales_transaction_id, menu_item_id, quantity, price_snapshot, cogs_snapshot, created_by)
    select target_shop_id, transaction_id, mi.id, line.quantity, mi.price,
      coalesce((
        select sum(rl.quantity * i.unit_cost)
        from public.recipe_lines rl
        join public.ingredients i on i.id = rl.ingredient_id
        where rl.recipe_id = latest_recipe_id
      ), 0), auth.uid()
    from public.menu_items mi
    where mi.id = line.menu_item_id and mi.shop_id = target_shop_id and mi.active;

    if not found then
      raise exception 'menu_item_not_found';
    end if;

    if latest_recipe_id is not null then
      for recipe_line in
        select rl.ingredient_id, rl.quantity * line.quantity as used_quantity
        from public.recipe_lines rl
        where rl.recipe_id = latest_recipe_id
      loop
        remaining := recipe_line.used_quantity;
        movement_key := idempotency_key || ':' || line.menu_item_id || ':' || recipe_line.ingredient_id;
        for lot in
          select id, quantity_remaining
          from public.inventory_lots
          where shop_id = target_shop_id and ingredient_id = recipe_line.ingredient_id and quantity_remaining > 0
          order by expires_on is null, expires_on, created_at
          for update
        loop
          exit when remaining <= 0;
          allocation := least(remaining, lot.quantity_remaining);
          update public.inventory_lots set quantity_remaining = quantity_remaining - allocation, updated_at = now() where id = lot.id;
          insert into public.inventory_movements (
            shop_id, ingredient_id, lot_id, type, quantity, occurred_at, source, note, idempotency_key, created_by
          ) values (
            target_shop_id, recipe_line.ingredient_id, lot.id, 'consumption', allocation,
            coalesce(occurred_at, now()), 'sale', 'ตัดจากยอดขาย', movement_key, auth.uid()
          ) on conflict (shop_id, idempotency_key) do nothing;
          remaining := remaining - allocation;
          movement_key := movement_key || ':' || lot.id;
        end loop;
        if remaining > 0 then
          insert into public.inventory_movements (
            shop_id, ingredient_id, type, quantity, occurred_at, source, note, idempotency_key, created_by
          ) values (
            target_shop_id, recipe_line.ingredient_id, 'consumption', remaining,
            coalesce(occurred_at, now()), 'sale', 'ตัดจากยอดขาย', movement_key, auth.uid()
          ) on conflict (shop_id, idempotency_key) do nothing;
        end if;
      end loop;
    end if;
  end loop;

  return transaction_id;
end;
$$;

create or replace function public.post_inventory_movement(
  target_shop_id uuid,
  target_ingredient_id uuid,
  movement_type public.inventory_movement_type,
  movement_quantity numeric,
  occurred_at timestamptz,
  note text,
  idempotency_key text,
  lot_code text default null,
  expires_on date default null,
  unit_cost numeric default null,
  adjustment_delta numeric default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  movement_id uuid;
  lot record;
  allocation numeric;
  remaining numeric := movement_quantity;
  movement_key text := idempotency_key;
  new_lot_id uuid;
begin
  if not public.is_shop_member(target_shop_id) then
    raise exception 'shop_access_denied';
  end if;
  if movement_quantity <= 0 then
    raise exception 'movement_quantity_invalid';
  end if;

  select id into movement_id
  from public.inventory_movements
  where shop_id = target_shop_id and inventory_movements.idempotency_key = post_inventory_movement.idempotency_key;
  if movement_id is not null then
    return movement_id;
  end if;

  if movement_type = 'receipt' then
    insert into public.inventory_lots (
      shop_id, ingredient_id, lot_code, quantity_received, quantity_remaining, unit_cost, expires_on, created_by
    ) values (
      target_shop_id, target_ingredient_id, lot_code, movement_quantity, movement_quantity,
      coalesce(unit_cost, 0), expires_on, auth.uid()
    ) returning id into new_lot_id;

    insert into public.inventory_movements (
      shop_id, ingredient_id, lot_id, type, quantity, occurred_at, source, note, idempotency_key, created_by
    ) values (
      target_shop_id, target_ingredient_id, new_lot_id, movement_type, movement_quantity,
      coalesce(occurred_at, now()), 'manual', note, idempotency_key, auth.uid()
    ) returning id into movement_id;
    return movement_id;
  end if;

  if movement_type in ('consumption', 'waste') then
    for lot in
      select id, quantity_remaining
      from public.inventory_lots
      where shop_id = target_shop_id and ingredient_id = target_ingredient_id and quantity_remaining > 0
      order by expires_on is null, expires_on, created_at
      for update
    loop
      exit when remaining <= 0;
      allocation := least(remaining, lot.quantity_remaining);
      update public.inventory_lots
      set quantity_remaining = quantity_remaining - allocation, updated_at = now()
      where id = lot.id;

      insert into public.inventory_movements (
        shop_id, ingredient_id, lot_id, type, quantity, occurred_at, source, note, idempotency_key, created_by
      ) values (
        target_shop_id, target_ingredient_id, lot.id, movement_type, allocation,
        coalesce(occurred_at, now()), 'manual', note, movement_key, auth.uid()
      ) returning id into movement_id;
      remaining := remaining - allocation;
      movement_key := idempotency_key || ':' || lot.id;
    end loop;

    if remaining > 0 then
      insert into public.inventory_movements (
        shop_id, ingredient_id, type, quantity, occurred_at, source, note, idempotency_key, created_by
      ) values (
        target_shop_id, target_ingredient_id, movement_type, remaining,
        coalesce(occurred_at, now()), 'manual', note, movement_key, auth.uid()
      ) returning id into movement_id;
    end if;
    return movement_id;
  end if;

  insert into public.inventory_movements (
    shop_id, ingredient_id, type, quantity, adjustment_delta, occurred_at, source, note, idempotency_key, created_by
  ) values (
    target_shop_id, target_ingredient_id, movement_type, abs(coalesce(adjustment_delta, movement_quantity)),
    coalesce(adjustment_delta, movement_quantity), coalesce(occurred_at, now()), 'manual', note, idempotency_key, auth.uid()
  ) returning id into movement_id;
  return movement_id;
end;
$$;

create or replace function public.confirm_daily_close(
  target_shop_id uuid,
  business_date date,
  occurred_at timestamptz,
  order_count integer,
  sale_lines jsonb,
  note text,
  idempotency_key text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  transaction_id uuid;
begin
  if not public.is_shop_member(target_shop_id) then
    raise exception 'shop_access_denied';
  end if;

  transaction_id := public.record_sales_batch(target_shop_id, business_date, occurred_at, order_count, sale_lines, idempotency_key);

  insert into public.daily_closes (shop_id, business_date, status, note, idempotency_key, created_by)
  values (target_shop_id, business_date, 'confirmed', note, idempotency_key, auth.uid())
  on conflict (shop_id, business_date, idempotency_key) do nothing;

  return transaction_id;
end;
$$;

grant execute on function public.create_shop_with_defaults(text, text) to authenticated;
grant execute on function public.save_recipe(uuid, uuid, jsonb) to authenticated;
grant execute on function public.record_sales_batch(uuid, date, timestamptz, integer, jsonb, text) to authenticated;
grant execute on function public.post_inventory_movement(uuid, uuid, public.inventory_movement_type, numeric, timestamptz, text, text, text, date, numeric, numeric) to authenticated;
grant execute on function public.confirm_daily_close(uuid, date, timestamptz, integer, jsonb, text, text) to authenticated;
