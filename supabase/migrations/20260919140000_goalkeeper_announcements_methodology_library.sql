begin;

-- Announcements can target one concrete operational group, including goalkeeper groups.
alter table public.announcement_targets
  add column group_id uuid references public.groups(id) on delete cascade;

alter table public.announcement_targets
  drop constraint if exists announcement_targets_target_type_check,
  drop constraint if exists announcement_target_shape;

alter table public.announcement_targets
  add constraint announcement_targets_target_type_check
    check (target_type in ('all', 'coach', 'age', 'group')),
  add constraint announcement_target_shape check (
    (target_type = 'all' and coach_id is null and age is null and group_id is null)
    or (target_type = 'coach' and coach_id is not null and age is null and group_id is null)
    or (target_type = 'age' and coach_id is null and age is not null and group_id is null)
    or (target_type = 'group' and coach_id is null and age is null and group_id is not null)
  );

create index announcement_targets_group_id_idx
on public.announcement_targets (group_id)
where group_id is not null;

create unique index announcement_targets_group_unique_idx
on public.announcement_targets (announcement_id, group_id)
where target_type = 'group';

create or replace function private.can_read_announcement(requested_announcement_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or ((select private.is_active_user()) and exists (
    select 1 from public.announcement_targets t
    where t.announcement_id = requested_announcement_id
      and (
        t.target_type = 'all'
        or (t.target_type = 'coach' and t.coach_id = (select auth.uid()))
        or (t.target_type = 'age' and (select private.has_assigned_age(t.age)))
        or (t.target_type = 'group' and (select private.has_group(t.group_id)))
      )
  ));
$$;

-- A general methodology library, independent from training tasks and visible to all active staff.
create table public.methodology_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (title)
);

create table public.methodology_section_materials (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.methodology_sections(id) on delete cascade,
  file_asset_id uuid not null references public.file_assets(id) on delete restrict,
  title text,
  description text,
  is_active boolean not null default true,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, file_asset_id)
);

create index methodology_sections_active_sort_idx
on public.methodology_sections (sort_order, title)
where is_active;
create index methodology_sections_created_by_idx on public.methodology_sections (created_by);
create index methodology_sections_updated_by_idx on public.methodology_sections (updated_by);
create index methodology_section_materials_file_idx on public.methodology_section_materials (file_asset_id);
create index methodology_section_materials_added_by_idx on public.methodology_section_materials (added_by);

create trigger methodology_sections_set_updated_at
before update on public.methodology_sections
for each row execute function private.set_updated_at();

create trigger methodology_section_materials_set_updated_at
before update on public.methodology_section_materials
for each row execute function private.set_updated_at();

create trigger methodology_sections_audit
after insert or update or delete on public.methodology_sections
for each row execute function private.audit_change();

create trigger methodology_section_materials_audit
after insert or update or delete on public.methodology_section_materials
for each row execute function private.audit_change();

alter table public.methodology_sections enable row level security;
alter table public.methodology_section_materials enable row level security;

create policy methodology_sections_staff_read
on public.methodology_sections for select to authenticated
using ((select private.is_admin()) or ((select private.is_active_user()) and is_active));

create policy methodology_sections_admin_all
on public.methodology_sections for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy methodology_section_materials_staff_read
on public.methodology_section_materials for select to authenticated
using (
  (select private.is_admin())
  or (
    (select private.is_active_user())
    and is_active
    and exists (
      select 1 from public.methodology_sections s
      where s.id = section_id and s.is_active
    )
  )
);

create policy methodology_section_materials_admin_all
on public.methodology_section_materials for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

grant select, insert, update, delete on public.methodology_sections, public.methodology_section_materials to authenticated;
grant all on public.methodology_sections, public.methodology_section_materials to service_role;
revoke all on public.methodology_sections, public.methodology_section_materials from anon;

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
              select 1
              from public.methodology_section_materials sm
              join public.methodology_sections s on s.id = sm.section_id
              where sm.file_asset_id = asset.id and sm.is_active and s.is_active
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

-- Word documents are accepted as structured batch-import sources.
update storage.buckets
set allowed_mime_types = array[
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'imports';

drop policy if exists private_objects_owner_delete on storage.objects;
create policy private_objects_owner_delete on storage.objects for delete to authenticated
using (((select private.is_admin()) and not exists (
  select 1 from public.file_assets f
  where f.bucket = bucket_id and f.object_path = name
    and (
      exists (select 1 from public.player_photos p where p.file_asset_id = f.id)
      or exists (select 1 from public.event_materials e where e.file_asset_id = f.id)
      or exists (select 1 from public.methodology_materials m where m.file_asset_id = f.id)
      or exists (select 1 from public.methodology_section_materials sm where sm.file_asset_id = f.id)
      or exists (select 1 from public.import_jobs i where i.file_asset_id = f.id)
      or exists (select 1 from public.export_jobs x where x.file_asset_id = f.id)
    )
)) or (
  bucket_id = 'task-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    not exists (select 1 from public.file_assets f where f.bucket = bucket_id and f.object_path = name)
    or exists (
      select 1 from public.file_assets f
      where f.bucket = bucket_id and f.object_path = name
        and f.owner_id = (select auth.uid())
        and f.scan_status in ('pending', 'rejected')
    )
  )
));

commit;
