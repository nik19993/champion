begin;

create table public.location_schedule_entries (
  id text primary key check (length(btrim(id)) > 0),
  school_number smallint not null check (school_number > 0),
  sort_order smallint not null default 0,
  group_name text check (length(btrim(group_name)) > 0),
  coach_names text[] not null check (cardinality(coach_names) > 0 and array_position(coach_names, null) is null),
  weekly_slots jsonb not null check (
    case when jsonb_typeof(weekly_slots) = 'array' then jsonb_array_length(weekly_slots) > 0 else false end
  )
);

alter table public.location_schedule_entries enable row level security;
revoke all on table public.location_schedule_entries from public, anon, authenticated;
grant select on table public.location_schedule_entries to authenticated;

create policy location_schedule_admin_read on public.location_schedule_entries
  for select to authenticated
  using ((select private.is_admin()));

commit;
