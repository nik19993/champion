begin;

-- Keep the existing owner and group restrictions, including the photo branch.
-- Location teams also need to register the documents already supported by the
-- event-task attachment RPC. Junior has no invented age range.
drop policy if exists file_assets_owner_insert on public.file_assets;
create policy file_assets_owner_insert on public.file_assets for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and (
    (select private.is_admin())
    or (
      context_group_id is not null
      and (select private.has_group(context_group_id))
      and (
        (bucket='player-photos' and context_type='player_photo' and context_age is null)
        or (
          bucket='task-documents'
          and exists (
            select 1 from public.groups g where g.id=context_group_id and (
              (g.group_kind='age' and context_age=coalesce(g.display_age,g.age))
              or (g.group_kind='goalkeeper' and context_age is null)
              or (g.group_kind='location' and (
                (g.team_suffix='A' and context_age between 6 and 8)
                or (g.team_suffix='B' and context_age between 9 and 12)
                or (g.team_suffix='C' and context_age between 13 and 17)
                or (g.team_suffix='Junior' and (context_age is null or context_age between 6 and 17))
              ))
            )
          )
        )
      )
    )
  )
);

-- Custom saved tasks are used by ordinary groups too. The previous function
-- accepted only goalkeeper groups, while the editor called it for both.
create or replace function private.attach_event_material(p_event_id uuid, p_file_asset_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_group_id uuid;
  target_type public.event_type;
  target_age integer;
  asset public.file_assets%rowtype;
begin
  select e.group_id,e.event_type,
    case when g.group_kind='goalkeeper' then null
      else coalesce(g.display_age,g.age,t.age_from) end
  into target_group_id,target_type,target_age
  from public.events e join public.groups g on g.id=e.group_id
  left join public.methodology_tasks t on t.id=e.task_id
  where e.id=p_event_id;

  if (select auth.uid()) is null or target_group_id is null
    or target_type <> 'training'
    or not (select private.has_group(target_group_id)) then
    raise exception 'Event material permission denied' using errcode='42501';
  end if;

  select * into asset from public.file_assets where id=p_file_asset_id for update;
  if asset.id is null or asset.owner_id is distinct from (select auth.uid())
    or asset.bucket <> 'task-documents' or asset.scan_status <> 'clean'
    or asset.context_group_id is distinct from target_group_id
    or asset.context_age is distinct from target_age then
    raise exception 'File is not a validated material for this event' using errcode='42501';
  end if;

  insert into public.event_materials(event_id,file_asset_id,source_type,actor_id)
  values (p_event_id,p_file_asset_id,'coach',(select auth.uid()))
  on conflict (event_id,file_asset_id) do nothing;
end;
$$;
revoke all on function private.attach_event_material(uuid,uuid) from public,anon,authenticated;
grant execute on function private.attach_event_material(uuid,uuid) to authenticated;

create or replace function public.attach_event_material(p_event_id uuid, p_file_asset_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.attach_event_material(p_event_id,p_file_asset_id);
$$;
revoke all on function public.attach_event_material(uuid,uuid) from public,anon,authenticated;
grant execute on function public.attach_event_material(uuid,uuid) to authenticated;

commit;
