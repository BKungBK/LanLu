-- Restore is intentionally separate from archive so the audit trail records
-- the user's explicit decision in both directions.
create or replace function public.restore_catalog_item(
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
    if coalesce((before_row->>'active')::boolean, true) then return; end if;
    update public.ingredients set active = true, updated_at = now()
    where id = target_id and shop_id = target_shop_id
    returning to_jsonb(ingredients.*) into after_row;
  elsif target_kind = 'menu' then
    select to_jsonb(m) into before_row
    from public.menu_items m
    where m.id = target_id and m.shop_id = target_shop_id
    for update;
    if before_row is null then raise exception 'menu_item_not_found'; end if;
    if before_row->>'archived_at' is null then return; end if;
    update public.menu_items set active = true, archived_at = null, updated_at = now()
    where id = target_id and shop_id = target_shop_id
    returning to_jsonb(menu_items.*) into after_row;
  else
    raise exception 'catalog_kind_invalid';
  end if;

  insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, before_data, after_data, created_by)
  values (target_shop_id, target_kind, target_id, 'restore', before_row, after_row, auth.uid());
end;
$$;

-- Archiving a recipe means stopping the whole recipe history from being used.
-- This prevents an older version from becoming active after the latest one is
-- archived, while keeping every version and its lines available for audit.
create or replace function public.archive_recipe(
  target_shop_id uuid,
  target_menu_item_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  recipe_row record;
  before_row jsonb;
  after_row jsonb;
  archived_any boolean := false;
begin
  if not public.is_shop_member(target_shop_id) then raise exception 'shop_access_denied'; end if;

  for recipe_row in
    select r.*
    from public.recipes r
    where r.shop_id = target_shop_id
      and r.menu_item_id = target_menu_item_id
      and r.archived_at is null
    order by r.version desc
    for update
  loop
    archived_any := true;
    before_row := to_jsonb(recipe_row);
    update public.recipes set archived_at = now()
    where id = recipe_row.id
    returning to_jsonb(recipes.*) into after_row;

    insert into public.catalog_audit_events (shop_id, entity_type, entity_id, action, before_data, after_data, created_by)
    values (target_shop_id, 'recipe', recipe_row.id, 'archive', before_row, after_row, auth.uid());
  end loop;

  if not archived_any then raise exception 'recipe_not_found'; end if;
end;
$$;

grant execute on function public.restore_catalog_item(uuid, text, uuid) to authenticated;
grant execute on function public.archive_recipe(uuid, uuid) to authenticated;
