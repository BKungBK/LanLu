-- Permanent deletion is deliberately restricted to archived catalog records
-- with no dependent history. Archive remains the normal removal action.
create or replace function public.delete_catalog_item(
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
begin
  if not public.is_shop_member(target_shop_id) then raise exception 'shop_access_denied'; end if;

  if target_kind = 'ingredient' then
    select to_jsonb(i) into before_row
    from public.ingredients i
    where i.id = target_id and i.shop_id = target_shop_id
    for update;
    if before_row is null then raise exception 'ingredient_not_found'; end if;
    if coalesce((before_row->>'active')::boolean, true) then raise exception 'catalog_item_must_be_archived'; end if;
    if exists (select 1 from public.recipe_lines where shop_id = target_shop_id and ingredient_id = target_id)
      then raise exception 'catalog_item_has_recipe_history'; end if;
    if exists (select 1 from public.inventory_movements where shop_id = target_shop_id and ingredient_id = target_id)
      then raise exception 'catalog_item_has_inventory_history'; end if;
    if exists (select 1 from public.inventory_lots where shop_id = target_shop_id and ingredient_id = target_id)
      then raise exception 'catalog_item_has_inventory_history'; end if;
    delete from public.ingredients where id = target_id and shop_id = target_shop_id;
  elsif target_kind = 'menu' then
    select to_jsonb(m) into before_row
    from public.menu_items m
    where m.id = target_id and m.shop_id = target_shop_id
    for update;
    if before_row is null then raise exception 'menu_item_not_found'; end if;
    if before_row->>'archived_at' is null then raise exception 'catalog_item_must_be_archived'; end if;
    if exists (select 1 from public.sales_lines where shop_id = target_shop_id and menu_item_id = target_id)
      then raise exception 'catalog_item_has_sales_history'; end if;
    if exists (select 1 from public.recipes where shop_id = target_shop_id and menu_item_id = target_id)
      then raise exception 'catalog_item_has_recipe_history'; end if;
    delete from public.menu_items where id = target_id and shop_id = target_shop_id;
  else
    raise exception 'catalog_kind_invalid';
  end if;

  insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, before_data, created_by)
  values (target_shop_id, target_kind, target_id, 'delete', before_row, auth.uid());
end;
$$;

grant execute on function public.delete_catalog_item(uuid, text, uuid) to authenticated;
