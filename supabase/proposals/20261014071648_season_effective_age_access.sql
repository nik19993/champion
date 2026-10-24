-- PROPOSAL ONLY: depends on the season proposal. Never apply to the live DB in review.
begin;

create or replace function private.has_assigned_age(requested_age integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_active_user()) and exists (
    select 1 from public.coach_group_assignments a
    join public.groups g on g.id = a.group_id
    where a.coach_id = (select auth.uid()) and a.is_active
      and coalesce(g.display_age, g.age) = requested_age
  );
$$;

-- Same active-user/group scope and photo rules; task age follows the season.
drop policy if exists file_assets_owner_insert on public.file_assets;
create policy file_assets_owner_insert on public.file_assets
for insert to authenticated with check (
  owner_id = (select auth.uid()) and (
    (select private.is_admin()) or (
      context_group_id is not null and (select private.has_group(context_group_id))
      and (
        (bucket = 'player-photos' and context_type = 'player_photo' and context_age is null)
        or (bucket = 'task-documents' and exists (
          select 1 from public.groups group_row
          where group_row.id = context_group_id and (
            (group_row.group_kind = 'age' and context_age = coalesce(group_row.display_age, group_row.age))
            or (group_row.group_kind = 'goalkeeper' and context_age is null)
          )
        ))
      )
    )
  )
);

-- Keep privileged access in private; the public RPC remains the same API.
create or replace function private.attach_event_task_material(p_event_id uuid, p_task_id uuid, p_file_asset_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_group_id uuid;
  target_age integer;
  target_task_id uuid;
  asset public.file_assets%rowtype;
begin
  select e.group_id, coalesce(g.display_age, g.age), e.task_id
  into target_group_id, target_age, target_task_id
  from public.events e join public.groups g on g.id = e.group_id
  where e.id = p_event_id;
  if (select auth.uid()) is null or target_group_id is null
    or target_task_id is distinct from p_task_id
    or not (select private.has_group(target_group_id)) then
    raise exception 'Event task material permission denied' using errcode = '42501';
  end if;
  select * into asset from public.file_assets where id = p_file_asset_id for update;
  if asset.id is null or asset.owner_id is distinct from (select auth.uid())
    or asset.bucket <> 'task-documents' or asset.scan_status <> 'clean'
    or asset.context_group_id is distinct from target_group_id
    or asset.context_age is distinct from target_age then
    raise exception 'File is not a validated material for this event' using errcode = '42501';
  end if;
  insert into public.event_materials(event_id, file_asset_id, source_type, actor_id)
  values (p_event_id, p_file_asset_id, 'coach', (select auth.uid()))
  on conflict (event_id, file_asset_id) do nothing;
  insert into public.methodology_materials(task_id, age_from, age_to, file_asset_id, added_by)
  values (p_task_id, target_age, target_age, p_file_asset_id, (select auth.uid()))
  on conflict (task_id, file_asset_id) do nothing;
end;
$$;

create or replace function public.attach_event_task_material(p_event_id uuid, p_task_id uuid, p_file_asset_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.attach_event_task_material(p_event_id, p_task_id, p_file_asset_id);
$$;
revoke all on function private.has_assigned_age(integer) from public, anon;
grant execute on function private.has_assigned_age(integer) to authenticated;
revoke all on function private.attach_event_task_material(uuid, uuid, uuid) from public, anon;
grant execute on function private.attach_event_task_material(uuid, uuid, uuid) to authenticated;
revoke all on function public.attach_event_task_material(uuid, uuid, uuid) from public, anon;
grant execute on function public.attach_event_task_material(uuid, uuid, uuid) to authenticated;
-- Existing event_materials/group access preserves historical attachments without
-- granting arbitrary old-age curriculum access after a season transition.
commit;
