begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('coach', 'admin');
create type public.profile_status as enum ('invited', 'active', 'suspended', 'closed');
create type public.assignment_role as enum ('lead', 'assistant');
-- This enum intentionally has exactly two states. There is no "missing data" state.
create type public.payment_status as enum ('paid', 'unpaid');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  role public.app_role not null default 'coach',
  status public.profile_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  age smallint not null check (age between 6 and 15),
  team_suffix text check (team_suffix in ('A', 'B')),
  competition_format text,
  inventory_visible_to_coach boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_code_shape check (
    (age in (6, 7) and team_suffix is null and code = 'U' || age::text)
    or
    (age between 8 and 15 and team_suffix is not null and code = 'U' || age::text || team_suffix)
  )
);

create table public.coach_group_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  assignment_role public.assignment_role not null default 'lead',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, group_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index coach_group_assignments_coach_idx on public.coach_group_assignments (coach_id) where is_active;
create index coach_group_assignments_group_idx on public.coach_group_assignments (group_id) where is_active;
create index audit_log_created_at_idx on public.audit_log (created_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger groups_set_updated_at before update on public.groups
for each row execute function private.set_updated_at();
create trigger assignments_set_updated_at before update on public.coach_group_assignments
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Новий користувач'),
    'coach',
    'invited'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and p.status = 'active'
    );
$$;

create or replace function private.has_group(requested_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_group_assignments a
    join public.profiles p on p.id = a.coach_id
    where a.coach_id = (select auth.uid())
      and a.group_id = requested_group_id
      and a.is_active
      and p.status = 'active'
  );
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.handle_new_user() from public;
revoke all on function private.is_active_user() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.has_group(uuid) from public;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.has_group(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.coach_group_assignments enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_read_own_or_admin on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_admin_insert on public.profiles
for insert to authenticated
with check ((select private.is_admin()));

create policy profiles_admin_update on public.profiles
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy profiles_admin_delete on public.profiles
for delete to authenticated
using ((select private.is_admin()));

create policy groups_read_assigned_or_admin on public.groups
for select to authenticated
using (
  is_active
  and ((select private.is_admin()) or (select private.has_group(id)))
);

create policy groups_admin_insert on public.groups
for insert to authenticated
with check ((select private.is_admin()));

create policy groups_admin_update on public.groups
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy groups_admin_delete on public.groups
for delete to authenticated
using ((select private.is_admin()));

create policy assignments_read_own_or_admin on public.coach_group_assignments
for select to authenticated
using (coach_id = (select auth.uid()) or (select private.is_admin()));

create policy assignments_admin_insert on public.coach_group_assignments
for insert to authenticated
with check ((select private.is_admin()));

create policy assignments_admin_update on public.coach_group_assignments
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy assignments_admin_delete on public.coach_group_assignments
for delete to authenticated
using ((select private.is_admin()));

create policy audit_admin_read on public.audit_log
for select to authenticated
using ((select private.is_admin()));

revoke all on public.profiles, public.groups, public.coach_group_assignments, public.audit_log from anon;
grant select, insert, update, delete on public.profiles, public.groups, public.coach_group_assignments to authenticated;
grant select on public.audit_log to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('methodology', 'methodology', false, 20971520, array['application/pdf']),
  ('task-documents', 'task-documents', false, 20971520, array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('player-photos', 'player-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('imports', 'imports', false, 20971520, array['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy methodology_read_active_staff on storage.objects
for select to authenticated
using (bucket_id = 'methodology' and (select private.is_active_user()));

create policy private_files_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id in ('methodology', 'task-documents', 'player-photos', 'imports') and (select private.is_admin()));

create policy private_files_admin_update on storage.objects
for update to authenticated
using (bucket_id in ('methodology', 'task-documents', 'player-photos', 'imports') and (select private.is_admin()))
with check (bucket_id in ('methodology', 'task-documents', 'player-photos', 'imports') and (select private.is_admin()));

create policy private_files_admin_delete on storage.objects
for delete to authenticated
using (bucket_id in ('methodology', 'task-documents', 'player-photos', 'imports') and (select private.is_admin()));

create policy private_files_admin_read on storage.objects
for select to authenticated
using (bucket_id in ('methodology', 'task-documents', 'player-photos', 'imports') and (select private.is_admin()));

commit;
