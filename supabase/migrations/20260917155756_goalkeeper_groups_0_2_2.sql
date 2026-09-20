begin;

-- Goalkeeper groups are full operational teams, but they are not age categories.
alter table public.groups
  drop constraint if exists groups_code_shape,
  drop constraint if exists groups_age_check,
  drop constraint if exists groups_team_suffix_check;

alter table public.groups
  alter column age drop not null,
  add column group_kind text not null default 'age';

alter table public.groups
  add constraint groups_kind_check check (group_kind in ('age', 'goalkeeper')),
  add constraint groups_shape_v2 check (
    (
      group_kind = 'age'
      and age between 6 and 15
      and (
        (age in (6, 7) and team_suffix is null and code = 'U' || age::text)
        or
        (age between 8 and 15 and team_suffix in ('A', 'B') and code = 'U' || age::text || team_suffix)
      )
    )
    or
    (
      group_kind = 'goalkeeper'
      and age is null
      and team_suffix in ('A', 'B', 'C')
      and code = 'Воротарі ' || team_suffix
    )
  );

create index groups_kind_sort_idx
on public.groups (group_kind, age, team_suffix)
where is_active;

insert into public.groups (id, code, age, team_suffix, group_kind, is_active)
values
  ('60000000-0000-0000-0000-000000000001', 'Воротарі A', null, 'A', 'goalkeeper', true),
  ('60000000-0000-0000-0000-000000000002', 'Воротарі B', null, 'B', 'goalkeeper', true),
  ('60000000-0000-0000-0000-000000000003', 'Воротарі C', null, 'C', 'goalkeeper', true)
on conflict (code) do update
set age = excluded.age,
    team_suffix = excluded.team_suffix,
    group_kind = excluded.group_kind,
    is_active = true,
    updated_at = now();

drop policy if exists file_assets_owner_insert on public.file_assets;
create policy file_assets_owner_insert on public.file_assets
for insert to authenticated
with check (
  owner_id = (select auth.uid()) and (
    (select private.is_admin())
    or (
      bucket = 'task-documents'
      and context_group_id is not null
      and (select private.has_group(context_group_id))
      and exists (
        select 1
        from public.groups g
        where g.id = context_group_id
          and (
            (g.group_kind = 'age' and context_age = g.age)
            or (g.group_kind = 'goalkeeper' and context_age is null)
          )
      )
    )
  )
);

create or replace function public.attach_event_material(
  p_event_id uuid,
  p_file_asset_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
  target_group_kind text;
  asset public.file_assets%rowtype;
begin
  select e.group_id, g.group_kind
  into target_group_id, target_group_kind
  from public.events e
  join public.groups g on g.id = e.group_id
  where e.id = p_event_id;

  if target_group_id is null
    or target_group_kind <> 'goalkeeper'
    or not (select private.has_group(target_group_id)) then
    raise exception 'Event material permission denied' using errcode = '42501';
  end if;

  select * into asset
  from public.file_assets
  where id = p_file_asset_id
  for update;

  if asset.id is null
    or asset.owner_id <> (select auth.uid())
    or asset.bucket <> 'task-documents'
    or asset.scan_status <> 'clean'
    or asset.context_group_id is distinct from target_group_id
    or asset.context_age is not null then
    raise exception 'File is not a validated material for this event' using errcode = '42501';
  end if;

  insert into public.event_materials(event_id, file_asset_id, source_type, actor_id)
  values (p_event_id, p_file_asset_id, 'coach', (select auth.uid()))
  on conflict (event_id, file_asset_id) do nothing;
end;
$$;

revoke all on function public.attach_event_material(uuid, uuid) from public;
grant execute on function public.attach_event_material(uuid, uuid) to authenticated;

commit;
