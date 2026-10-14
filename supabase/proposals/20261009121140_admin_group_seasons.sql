-- PROPOSAL ONLY. Do not move to migrations or apply without owner approval.
begin;

-- `code` and `age` remain stable baseline keys. Only presentation changes.
alter table public.groups
  add column cohort_birth_year smallint check (cohort_birth_year between 2000 and 2100),
  add column display_age smallint check (display_age between 6 and 99),
  add column display_code text;
create unique index groups_display_code_unique on public.groups(display_code);

create table public.club_season_settings (
  id boolean primary key default true check (id),
  start_year smallint not null check (start_year between 2000 and 2099),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index club_season_settings_updated_by_idx on public.club_season_settings(updated_by);
alter table public.club_season_settings enable row level security;
create policy club_season_read on public.club_season_settings for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'active'));
revoke all on public.club_season_settings from public, authenticated, anon;
grant select on public.club_season_settings to authenticated;

create table public.group_season_history (
  group_id uuid not null references public.groups(id) on delete restrict,
  start_year smallint not null,
  code text not null,
  birth_year smallint not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key (group_id, start_year)
);
create index group_season_history_changed_by_idx on public.group_season_history(changed_by);
alter table public.group_season_history enable row level security;
create policy group_season_history_read on public.group_season_history for select to authenticated
  using ((select private.is_admin()) or private.has_group(group_id));
revoke all on public.group_season_history from public, authenticated, anon;
grant select on public.group_season_history to authenticated;

create function public.initialize_club_season(p_start_year integer, p_cohorts jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  target public.groups%rowtype;
  cohort integer;
  total integer := 0;
begin
  if not (select private.is_admin()) then
    raise exception 'Administrator MFA required' using errcode = '42501';
  end if;
  -- Also protects concurrent first-time initialization before a settings row exists.
  perform pg_catalog.pg_advisory_xact_lock(6321092026);
  if exists (select 1 from public.club_season_settings) then
    raise exception 'SEASON_ALREADY_INITIALIZED' using errcode = '40001';
  end if;
  if p_start_year is null or p_start_year not between 2000 and 2099
    or p_cohorts is null or pg_catalog.jsonb_typeof(p_cohorts) <> 'object' then
    raise exception 'INVALID_INITIAL_SEASON' using errcode = '22023';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_cohorts)) <>
    (select count(*) from public.groups where is_active and group_kind = 'age') then
    raise exception 'ALL_GROUP_COHORTS_REQUIRED' using errcode = '22023';
  end if;
  for target in select * from public.groups where is_active and group_kind = 'age' order by id for update loop
    cohort := (p_cohorts ->> target.id::text)::integer;
    if cohort is null or cohort not between 2000 and 2100
      or p_start_year + 1 - cohort <> target.age then
      raise exception 'COHORT_DOES_NOT_MATCH_BASELINE: %', target.code using errcode = '22023';
    end if;
    update public.groups set cohort_birth_year = cohort, display_age = age,
      display_code = code, season = p_start_year::text || '/' || (p_start_year + 1)::text
    where id = target.id;
    insert into public.group_season_history(group_id,start_year,code,birth_year,changed_by)
    values(target.id,p_start_year,target.code,cohort,(select auth.uid()));
    total := total + 1;
  end loop;
  if total = 0 then raise exception 'NO_AGE_GROUPS' using errcode = '22023'; end if;
  insert into public.club_season_settings(id,start_year,updated_by)
  values(true,p_start_year,(select auth.uid()));
  return total;
end;
$$;

create function public.advance_club_season(p_expected_start_year integer, p_next_start_year integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  current_year integer;
  target public.groups%rowtype;
  next_age integer;
  total integer := 0;
begin
  if not (select private.is_admin()) then
    raise exception 'Administrator MFA required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(6321092026);
  select start_year into current_year from public.club_season_settings where id for update;
  if current_year is null then raise exception 'INITIAL_SEASON_REQUIRED' using errcode = '22023'; end if;
  if p_expected_start_year is distinct from current_year then
    raise exception 'SEASON_CHANGED_RELOAD_PREVIEW' using errcode = '40001';
  end if;
  if p_next_start_year is null or p_next_start_year <> current_year + 1 or p_next_start_year > 2099 then
    raise exception 'ONLY_NEXT_SEASON_ALLOWED' using errcode = '22023';
  end if;
  -- Fail before any renaming if new groups lack an explicitly initialized cohort.
  if exists (select 1 from public.groups where is_active and group_kind = 'age'
    and (cohort_birth_year is null or season is distinct from current_year::text || '/' || (current_year + 1)::text)) then
    raise exception 'GROUP_SEASON_SETUP_REQUIRED' using errcode = '22023';
  end if;
  -- Clear display labels in this transaction to avoid U11A -> U12A unique conflicts.
  update public.groups set display_code = null where is_active and group_kind = 'age';
  for target in select * from public.groups where is_active and group_kind = 'age' order by id for update loop
    next_age := p_next_start_year + 1 - target.cohort_birth_year;
    -- Change only the label, retaining the original group and suffix.
    if next_age not between 6 and 99 then
      raise exception 'GROUP_TRANSITION_RULE_REQUIRED: %', target.code using errcode = '22023';
    end if;
    update public.groups set display_age = next_age,
      display_code = 'U' || next_age::text || coalesce(target.team_suffix,''),
      season = p_next_start_year::text || '/' || (p_next_start_year + 1)::text
    where id = target.id;
    insert into public.group_season_history(group_id,start_year,code,birth_year,changed_by)
    values(target.id,p_next_start_year,'U' || next_age::text || coalesce(target.team_suffix,''),target.cohort_birth_year,(select auth.uid()));
    total := total + 1;
  end loop;
  update public.club_season_settings set start_year = p_next_start_year,
    updated_by = (select auth.uid()), updated_at = now() where id;
  return total;
end;
$$;
revoke all on function public.initialize_club_season(integer,jsonb) from public, anon;
revoke all on function public.advance_club_season(integer,integer) from public, anon;
grant execute on function public.initialize_club_season(integer,jsonb) to authenticated;
grant execute on function public.advance_club_season(integer,integer) to authenticated;
commit;
