-- A catalog position may be retired after it was ordered. Preserve those lines
-- when the coach saves changes to the active positions or the request details.
CREATE OR REPLACE FUNCTION public.save_uniform_request(p_player_id uuid, p_number smallint, p_surname_print text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_group_id uuid;
  target_request_id uuid;
  current_status public.uniform_status;
  item jsonb;
  catalog_id uuid;
  selected_size text;
  catalog_sizes text[];
begin
  if not (select private.is_active_user()) then
    raise exception 'Active user required' using errcode = '42501';
  end if;
  select group_id into target_group_id from public.players where id = p_player_id and is_active;
  if target_group_id is null or (not (select private.is_admin()) and not (select private.has_group(target_group_id))) then
    raise exception 'Player permission denied' using errcode = '42501';
  end if;
  if p_number is not null and (p_number < 0 or p_number > 99) then
    raise exception 'Invalid uniform number' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Uniform items must be an array' using errcode = '22023';
  end if;

  select id, status into target_request_id, current_status
  from public.uniform_requests where player_id = p_player_id for update;
  if target_request_id is not null and not (select private.is_admin()) and current_status in ('preparing', 'issued') then
    raise exception 'Uniform request is locked' using errcode = '42501';
  end if;

  if target_request_id is null then
    insert into public.uniform_requests(player_id, number, surname_print, status, requested_by, updated_by)
    values (p_player_id, p_number, nullif(trim(p_surname_print), ''), 'requested', (select auth.uid()), (select auth.uid()))
    returning id into target_request_id;
  else
    update public.uniform_requests
    set number = p_number, surname_print = nullif(trim(p_surname_print), ''), status = 'requested',
        requested_by = coalesce(requested_by, (select auth.uid())), updated_by = (select auth.uid())
    where id = target_request_id;
    delete from public.uniform_request_items existing
    using public.uniform_catalog_items catalog
    where existing.request_id = target_request_id
      and existing.catalog_item_id = catalog.id
      and catalog.is_active;
  end if;

  for item in select value from jsonb_array_elements(p_items) loop
    catalog_id := (item ->> 'catalog_item_id')::uuid;
    selected_size := trim(item ->> 'size');
    select sizes into catalog_sizes
    from public.uniform_catalog_items where id = catalog_id and is_active;
    if catalog_sizes is null then
      raise exception 'Active catalog item not found' using errcode = 'P0002';
    end if;
    if selected_size is null or selected_size = ''
      or (cardinality(catalog_sizes) > 0 and not selected_size = any(catalog_sizes)) then
      raise exception 'Invalid uniform size' using errcode = '22023';
    end if;
    insert into public.uniform_request_items(request_id, catalog_item_id, size, quantity, actor_id)
    values (target_request_id, catalog_id, selected_size, 1, (select auth.uid()));
  end loop;
  return target_request_id;
end;
$function$;
