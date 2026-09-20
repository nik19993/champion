create or replace function private.can_read_file_asset(requested_asset_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.file_assets asset
    where asset.id = requested_asset_id
      and (
        (select private.is_admin())
        or asset.owner_id = (select auth.uid())
        or (
          asset.scan_status = 'clean'
          and (select private.is_active_user())
          and (
            (asset.context_group_id is not null and (select private.has_group(asset.context_group_id)))
            or (asset.context_age is not null and (select private.has_assigned_age(asset.context_age)))
            or exists (
              select 1 from public.methodology_materials m
              where m.file_asset_id = asset.id
                and exists (
                  select 1
                  from generate_series(m.age_from::integer, m.age_to::integer) as ages(age)
                  where (select private.has_assigned_age(ages.age))
                )
            )
            or exists (
              select 1 from public.event_materials em
              join public.events e on e.id = em.event_id
              where em.file_asset_id = asset.id and (select private.has_group(e.group_id))
            )
            or exists (
              select 1 from public.player_photos pp
              join public.players p on p.id = pp.player_id
              where pp.file_asset_id = asset.id and (select private.has_group(p.group_id))
            )
          )
        )
      )
  );
$$;
