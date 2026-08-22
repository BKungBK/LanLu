alter table public.ingredients
  add column if not exists purchase_package_unit text,
  add column if not exists purchase_package_count numeric(14,3),
  add column if not exists purchase_content_quantity numeric(14,3),
  add column if not exists purchase_content_unit text,
  add column if not exists purchase_price numeric(14,4),
  add column if not exists purchase_conversion_factor numeric(14,6);

alter table public.catalog_import_batches drop constraint if exists catalog_import_batches_kind_check;
alter table public.catalog_import_batches add constraint catalog_import_batches_kind_check check (kind in ('ingredient', 'menu', 'recipe', 'bundle'));

create or replace function public.catalog_unit_factor(content_unit text, base_unit text, explicit_factor numeric default null)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  content text := lower(regexp_replace(coalesce(content_unit, ''), '[\s._-]+', '', 'g'));
  base text := lower(regexp_replace(coalesce(base_unit, ''), '[\s._-]+', '', 'g'));
begin
  if explicit_factor is not null and explicit_factor > 0 then return explicit_factor; end if;
  if content = base then return 1; end if;
  if content in ('g', 'gram', 'grams', 'กรัม', 'ก') and base in ('kg', 'กก', 'กิโลกรัม', 'กิโล') then return 0.001; end if;
  if content in ('kg', 'กก', 'กิโลกรัม', 'กิโล') and base in ('g', 'gram', 'grams', 'กรัม', 'ก') then return 1000; end if;
  if content in ('ml', 'milliliter', 'milliliters', 'มล', 'มิลลิลิตร') and base in ('l', 'liter', 'liters', 'ลิตร') then return 0.001; end if;
  if content in ('l', 'liter', 'liters', 'ลิตร') and base in ('ml', 'milliliter', 'milliliters', 'มล', 'มิลลิลิตร') then return 1000; end if;
  if content in ('piece', 'pieces', 'ชิ้น', 'หน่วย') and base in ('piece', 'pieces', 'ชิ้น', 'หน่วย') then return 1; end if;
  return null;
end;
$$;

create or replace function public.catalog_purchase_unit_cost(purchase jsonb, base_unit text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(nullif(purchase->>'packageCount', '')::numeric, 0) > 0
      and coalesce(nullif(purchase->>'contentQuantity', '')::numeric, 0) > 0
      and coalesce(nullif(purchase->>'purchasePrice', '')::numeric, -1) >= 0
      and public.catalog_unit_factor(purchase->>'contentUnit', base_unit, nullif(purchase->>'conversionFactor', '')::numeric) is not null
    then round((nullif(purchase->>'purchasePrice', '')::numeric / (nullif(purchase->>'packageCount', '')::numeric * nullif(purchase->>'contentQuantity', '')::numeric * public.catalog_unit_factor(purchase->>'contentUnit', base_unit, nullif(purchase->>'conversionFactor', '')::numeric)))::numeric, 6)
    else null
  end;
$$;

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
  calculated_unit_cost numeric;
begin
  if not public.is_shop_member(target_shop_id) then raise exception 'shop_access_denied'; end if;
  if target_kind = 'ingredient' then
    select to_jsonb(i) into before_row from public.ingredients i where i.id = target_id and i.shop_id = target_shop_id for update;
    if before_row is null then raise exception 'ingredient_not_found'; end if;
    calculated_unit_cost := public.catalog_purchase_unit_cost(payload, coalesce(nullif(payload->>'unit', ''), before_row->>'unit'));
    update public.ingredients set
      name = coalesce(nullif(trim(payload->>'name'), ''), name),
      unit = coalesce(nullif(trim(payload->>'unit'), ''), unit),
      supplier = case when payload ? 'supplier' then nullif(trim(payload->>'supplier'), '') else supplier end,
      reorder_point = case when payload ? 'reorderPoint' then (payload->>'reorderPoint')::numeric else reorder_point end,
      unit_cost = coalesce(calculated_unit_cost, case when payload ? 'unitCost' then (payload->>'unitCost')::numeric else unit_cost end),
      purchase_package_unit = case when payload ? 'packageUnit' then nullif(trim(payload->>'packageUnit'), '') else purchase_package_unit end,
      purchase_package_count = case when payload ? 'packageCount' then nullif(payload->>'packageCount', '')::numeric else purchase_package_count end,
      purchase_content_quantity = case when payload ? 'contentQuantity' then nullif(payload->>'contentQuantity', '')::numeric else purchase_content_quantity end,
      purchase_content_unit = case when payload ? 'contentUnit' then nullif(trim(payload->>'contentUnit'), '') else purchase_content_unit end,
      purchase_price = case when payload ? 'purchasePrice' then nullif(payload->>'purchasePrice', '')::numeric else purchase_price end,
      purchase_conversion_factor = case when payload ? 'conversionFactor' then nullif(payload->>'conversionFactor', '')::numeric else purchase_conversion_factor end,
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
  category_id uuid;
  ingredient_id uuid;
  menu_id uuid;
  recipe_id uuid;
  current_menu_id uuid;
  next_version integer;
  imported integer := 0;
  existing_id uuid;
  calculated_unit_cost numeric;
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
      calculated_unit_cost := public.catalog_purchase_unit_cost(row_data, row_data->>'unit');
      select id into existing_id from public.ingredients where shop_id = target_shop_id and lower(name) = lower(trim(row_data->>'name')) limit 1;
      if existing_id is not null and conflict_mode = 'skip' then continue; end if;
      if existing_id is not null and conflict_mode = 'update' then
        perform public.update_catalog_master(target_shop_id, 'ingredient', existing_id, row_data || case when calculated_unit_cost is null then '{}'::jsonb else jsonb_build_object('unitCost', calculated_unit_cost) end);
      elsif existing_id is null then
        insert into public.ingredients (shop_id, name, unit, supplier, reorder_point, unit_cost, purchase_package_unit, purchase_package_count, purchase_content_quantity, purchase_content_unit, purchase_price, purchase_conversion_factor, created_by)
        values (target_shop_id, trim(row_data->>'name'), trim(row_data->>'unit'), nullif(trim(row_data->>'supplier'), ''), coalesce(nullif(row_data->>'reorderPoint', '')::numeric, 0), coalesce(calculated_unit_cost, nullif(row_data->>'unitCost', '')::numeric, 0), nullif(trim(row_data->>'packageUnit'), ''), nullif(row_data->>'packageCount', '')::numeric, nullif(row_data->>'contentQuantity', '')::numeric, nullif(trim(row_data->>'contentUnit'), ''), nullif(row_data->>'purchasePrice', '')::numeric, nullif(row_data->>'conversionFactor', '')::numeric, auth.uid()) returning id into ingredient_id;
        insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, after_data, created_by) values (target_shop_id, 'ingredient', ingredient_id, 'import_create', row_data, auth.uid());
        if coalesce(nullif(row_data->>'quantityOnHand', '')::numeric, 0) > 0 then
          perform public.post_inventory_movement(target_shop_id, ingredient_id, 'receipt', (row_data->>'quantityOnHand')::numeric, now(), 'ยอดเริ่มต้นจาก CSV import', idempotency_key || ':receipt:' || ingredient_id, null, nullif(row_data->>'expiresOn', '')::date, coalesce(calculated_unit_cost, nullif(row_data->>'unitCost', '')::numeric, 0), null);
        end if;
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
      end if;
    else
      select mi.id into menu_id from public.menu_items mi where mi.shop_id = target_shop_id and lower(mi.name) = lower(trim(row_data->>'menuName')) limit 1;
      select i.id into ingredient_id from public.ingredients i where i.shop_id = target_shop_id and lower(i.name) = lower(trim(row_data->>'ingredientName')) limit 1;
      if menu_id is null or ingredient_id is null or coalesce(nullif(row_data->>'quantity', '')::numeric, 0) <= 0 then raise exception 'import_reference_not_found'; end if;
      if current_menu_id is distinct from menu_id then
        current_menu_id := menu_id;
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

create or replace function public.bulk_import_catalog_bundle(
  target_shop_id uuid,
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
  draft jsonb;
  draft_index integer := 0;
  imported integer := 0;
begin
  if not public.is_shop_member(target_shop_id) then raise exception 'shop_access_denied'; end if;
  if conflict_mode not in ('create', 'update', 'skip') then raise exception 'conflict_mode_invalid'; end if;
  if jsonb_array_length(coalesce(import_rows, '[]'::jsonb)) = 0 then raise exception 'import_requires_rows'; end if;
  select id into batch_id from public.catalog_import_batches where shop_id = target_shop_id and catalog_import_batches.idempotency_key = bulk_import_catalog_bundle.idempotency_key;
  if batch_id is not null then return jsonb_build_object('batchId', batch_id, 'replayed', true); end if;
  insert into public.catalog_import_batches (shop_id, kind, idempotency_key, conflict_mode, row_count, created_by) values (target_shop_id, 'bundle', idempotency_key, conflict_mode, 0, auth.uid()) returning id into batch_id;
  for draft in select element.value from jsonb_array_elements(import_rows) as element(value)
    order by case element.value->>'kind' when 'ingredient' then 1 when 'menu' then 2 when 'recipe' then 3 else 4 end
  loop
    if draft->>'kind' not in ('ingredient', 'menu', 'recipe') or jsonb_array_length(coalesce(draft->'rows', '[]'::jsonb)) = 0 then raise exception 'catalog_bundle_invalid'; end if;
    perform public.bulk_import_catalog(target_shop_id, draft->>'kind', draft->'rows', idempotency_key || ':' || draft_index, conflict_mode);
    imported := imported + jsonb_array_length(draft->'rows');
    draft_index := draft_index + 1;
  end loop;
  update public.catalog_import_batches set row_count = imported where id = batch_id;
  insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, after_data, created_by) values (target_shop_id, 'import', batch_id, 'bundle_import', jsonb_build_object('draftCount', draft_index, 'rowCount', imported), auth.uid());
  return jsonb_build_object('batchId', batch_id, 'imported', imported, 'replayed', false);
exception when others then
  if batch_id is not null then update public.catalog_import_batches set status = 'failed', error_message = sqlerrm where id = batch_id; end if;
  raise;
end;
$$;

grant execute on function public.catalog_unit_factor(text, text, numeric) to authenticated;
grant execute on function public.catalog_purchase_unit_cost(jsonb, text) to authenticated;
grant execute on function public.bulk_import_catalog_bundle(uuid, jsonb, text, text) to authenticated;
