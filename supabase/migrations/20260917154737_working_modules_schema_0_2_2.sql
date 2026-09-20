
create type public.event_type as enum ('training', 'oblast', 'ukraine', 'tournament', 'theory');
create type public.attendance_status as enum ('present', 'absent');
create type public.operational_type as enum ('conflict', 'organizational_need', 'coach_substitution', 'reschedule', 'comment');
create type public.operational_status as enum ('todo', 'in_progress', 'done');
create type public.uniform_status as enum ('not_ordered', 'requested', 'preparing', 'issued');
create type public.methodology_phase as enum ('attack', 'defence');
create type public.methodology_level as enum ('individual', 'group', 'team');
create type public.file_scan_status as enum ('pending', 'clean', 'rejected');
create type public.job_status as enum ('uploaded', 'previewed', 'confirmed', 'failed', 'cancelled', 'completed');

alter table public.profiles
  add column first_name text,
  add column last_name text,
  add column middle_name text,
  add column email text,
  add column must_change_password boolean not null default true;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

create unique index profiles_email_unique_idx on public.profiles (lower(email)) where email is not null;

alter table public.groups
  drop column if exists inventory_visible_to_coach,
  add column regulation_source text,
  add column regulation_verified_on date,
  add column season text;

alter table public.coach_group_assignments
  add column valid_from date not null default current_date,
  add column valid_to date,
  add column created_by uuid references public.profiles(id) on delete set null,
  add constraint assignments_valid_period check (valid_to is null or valid_to >= valid_from);

create unique index one_active_lead_per_group_idx
on public.coach_group_assignments (group_id)
where is_active and assignment_role = 'lead';

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue_type text not null default 'field',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index venues_active_name_idx on public.venues (lower(name)) where is_active;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  full_name text not null check (char_length(trim(full_name)) between 2 and 180),
  first_name text,
  last_name text,
  middle_name text,
  birth_date date,
  birth_year smallint check (birth_year between 2000 and 2100),
  position text,
  dominant_foot text,
  coach_note text,
  active_from date not null default current_date,
  active_to date,
  is_active boolean not null default true,
  external_key text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_active_period check (active_to is null or active_to >= active_from)
);

create index players_group_active_idx on public.players (group_id, full_name) where is_active;
create unique index players_external_key_idx on public.players (external_key) where external_key is not null;

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  full_name text,
  relation text,
  phone text,
  email text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.physical_test_results (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  measured_on date not null,
  metric_name text not null,
  value text not null,
  unit text,
  source text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.game_activity_results (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  period text not null,
  metric_name text not null,
  value text not null,
  source text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.monthly_payments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  status public.payment_status not null default 'unpaid',
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (player_id, month)
);

create table public.uniform_catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sizes text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uniform_catalog_active_name_idx on public.uniform_catalog_items (lower(name)) where is_active;

create table public.uniform_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references public.players(id) on delete cascade,
  number smallint check (number between 0 and 99),
  surname_print text,
  status public.uniform_status not null default 'not_ordered',
  admin_note text,
  requested_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.uniform_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.uniform_requests(id) on delete cascade,
  catalog_item_id uuid not null references public.uniform_catalog_items(id),
  size text not null,
  quantity integer not null default 1 check (quantity > 0),
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (request_id, catalog_item_id)
);

create table public.methodology_tasks (
  id uuid primary key default gen_random_uuid(),
  phase public.methodology_phase not null,
  level public.methodology_level not null,
  component text,
  title text not null,
  description text,
  age_from smallint not null check (age_from between 6 and 15),
  age_to smallint not null check (age_to between 6 and 15 and age_to >= age_from),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index methodology_tasks_age_idx on public.methodology_tasks (age_from, age_to) where is_active;

create table public.terminology_entries (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  definition text not null,
  category text not null,
  source text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index terminology_search_idx on public.terminology_entries using gin (to_tsvector('simple', term || ' ' || definition || ' ' || category));

create table public.training_structures (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age_from smallint not null check (age_from between 6 and 15),
  age_to smallint not null check (age_to between 6 and 15 and age_to >= age_from),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_structure_steps (
  id uuid primary key default gen_random_uuid(),
  structure_id uuid not null references public.training_structures(id) on delete cascade,
  position integer not null check (position > 0),
  duration_minutes integer not null check (duration_minutes between 1 and 180),
  title text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (structure_id, position)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  event_type public.event_type not null,
  start_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 360),
  ends_at timestamptz not null,
  venue_id uuid references public.venues(id),
  task_id uuid references public.methodology_tasks(id),
  coach_id uuid not null references public.profiles(id),
  substitute_coach_id uuid references public.profiles(id),
  title text,
  notes text,
  organizational_need text,
  coach_comment text,
  needs_substitute boolean not null default false,
  original_start_at timestamptz,
  is_rescheduled boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  idempotency_key uuid not null default gen_random_uuid() unique,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_requires_task_type check (task_id is null or event_type = 'training')
);

create index events_group_start_idx on public.events (group_id, start_at);
create index events_coach_start_idx on public.events (coach_id, start_at) where status = 'scheduled';
create index events_venue_start_idx on public.events (venue_id, start_at) where venue_id is not null and status = 'scheduled';

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete restrict,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  idempotency_key uuid not null unique,
  client_created_at timestamptz not null default now(),
  server_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  status public.attendance_status not null,
  note text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, player_id)
);

create table public.operational_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  event_id uuid references public.events(id) on delete set null,
  item_type public.operational_type not null,
  status public.operational_status not null default 'todo',
  title text not null,
  comment text,
  due_at timestamptz,
  assigned_to uuid references public.profiles(id),
  dedupe_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index operational_items_status_idx on public.operational_items (status, created_at desc);

create table public.file_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  bucket text not null,
  object_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum text,
  scan_status public.file_scan_status not null default 'pending',
  context_type text not null,
  context_group_id uuid references public.groups(id),
  context_age smallint check (context_age between 6 and 15),
  created_at timestamptz not null default now(),
  unique (bucket, object_path)
);

create table public.player_photos (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  file_asset_id uuid not null references public.file_assets(id) on delete restrict,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index player_current_photo_idx on public.player_photos (player_id) where is_current;

create table public.event_materials (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  file_asset_id uuid not null references public.file_assets(id) on delete restrict,
  source_type text not null check (source_type in ('admin', 'coach')),
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, file_asset_id)
);

create table public.methodology_materials (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.methodology_tasks(id) on delete cascade,
  age_from smallint not null check (age_from between 6 and 15),
  age_to smallint not null check (age_to between 6 and 15 and age_to >= age_from),
  file_asset_id uuid not null references public.file_assets(id) on delete restrict,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (task_id, file_asset_id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  name text not null,
  quantity integer not null default 0 check (quantity >= 0),
  damaged integer not null default 0 check (damaged >= 0),
  lost integer not null default 0 check (lost >= 0),
  needed integer not null default 0 check (needed >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index inventory_group_name_active_idx on public.inventory_items (group_id, lower(name)) where is_active;

create table public.inventory_permissions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  can_edit_quantity boolean not null default false,
  can_report_issues boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (coach_id, group_id)
);

create table public.inventory_adjustments (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  field_name text not null,
  old_value integer not null,
  new_value integer not null,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  require_acknowledgement boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_period check (ends_at is null or ends_at >= starts_at)
);

create table public.announcement_targets (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  target_type text not null check (target_type in ('all', 'coach', 'age')),
  coach_id uuid references public.profiles(id) on delete cascade,
  age smallint check (age between 6 and 15),
  created_at timestamptz not null default now(),
  constraint announcement_target_shape check (
    (target_type = 'all' and coach_id is null and age is null)
    or (target_type = 'coach' and coach_id is not null and age is null)
    or (target_type = 'age' and coach_id is null and age is not null)
  )
);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset text not null,
  file_asset_id uuid references public.file_assets(id),
  status public.job_status not null default 'uploaded',
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  checksum text,
  created_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_rows (
  id bigint generated always as identity primary key,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null,
  payload jsonb not null,
  errors text[] not null default '{}',
  warnings text[] not null default '{}',
  is_valid boolean not null default false,
  unique (import_job_id, row_number)
);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  export_type text not null,
  filters jsonb not null default '{}',
  status public.job_status not null default 'completed',
  file_asset_id uuid references public.file_assets(id),
  created_by uuid not null references public.profiles(id),
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.audit_log
  add column old_values jsonb,
  add column new_values jsonb,
  add column request_id uuid;
