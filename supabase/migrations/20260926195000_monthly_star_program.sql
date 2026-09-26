begin;

create type public.behavior_card_reason as enum (
  'late',
  'discipline_violation',
  'coach_noncompliance',
  'safety',
  'unsporting_behavior',
  'disrespect',
  'other'
);

create type public.monthly_star_award_type as enum ('coach_choice', 'team_choice');

create table public.monthly_star_themes (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text not null check (char_length(trim(description)) between 2 and 1200),
  criteria text check (criteria is null or char_length(trim(criteria)) between 2 and 1200),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_behavior_cards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete restrict,
  coach_id uuid references public.profiles(id) on delete set null,
  coach_name_snapshot text not null,
  event_id uuid references public.events(id) on delete set null,
  occurred_on date not null default (timezone('Europe/Kyiv', now()))::date,
  month date generated always as (date_trunc('month', occurred_on::timestamp)::date) stored,
  reason public.behavior_card_reason not null,
  comment text check (comment is null or char_length(trim(comment)) between 2 and 500),
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text check (void_reason is null or char_length(trim(void_reason)) between 2 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint behavior_card_other_comment check (reason <> 'other' or comment is not null),
  constraint behavior_card_void_shape check (
    (not is_voided and voided_at is null and voided_by is null and void_reason is null)
    or (is_voided and voided_at is not null and voided_by is not null and void_reason is not null)
  )
);

create table public.parent_contact_actions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete restrict,
  month date not null check (extract(day from month) = 1),
  coach_id uuid references public.profiles(id) on delete set null,
  coach_name_snapshot text not null,
  contacted_at timestamptz not null default now(),
  comment text check (comment is null or char_length(trim(comment)) between 2 and 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.monthly_star_awards (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  group_id uuid not null references public.groups(id) on delete restrict,
  theme_id uuid not null references public.monthly_star_themes(id) on delete restrict,
  award_type public.monthly_star_award_type not null,
  player_id uuid not null references public.players(id) on delete restrict,
  selected_by uuid references public.profiles(id) on delete set null,
  correction_note text check (correction_note is null or char_length(trim(correction_note)) between 2 and 500),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revocation_reason text check (revocation_reason is null or char_length(trim(revocation_reason)) between 2 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint monthly_star_revocation_shape check (
    (revoked_at is null and revoked_by is null and revocation_reason is null)
    or (revoked_at is not null and revoked_by is not null and revocation_reason is not null)
  )
);

create unique index monthly_star_awards_type_active_idx
on public.monthly_star_awards (group_id, month, award_type)
where revoked_at is null;

create unique index monthly_star_awards_player_active_idx
on public.monthly_star_awards (group_id, month, player_id)
where revoked_at is null;

create index monthly_star_themes_created_by_idx on public.monthly_star_themes (created_by);
create index monthly_star_themes_updated_by_idx on public.monthly_star_themes (updated_by);
create index behavior_cards_group_month_idx on public.player_behavior_cards (group_id, month) where not is_voided;
create index behavior_cards_player_month_idx on public.player_behavior_cards (player_id, month) where not is_voided;
create index behavior_cards_coach_idx on public.player_behavior_cards (coach_id);
create index behavior_cards_event_idx on public.player_behavior_cards (event_id) where event_id is not null;
create index behavior_cards_voided_by_idx on public.player_behavior_cards (voided_by) where voided_by is not null;
create index parent_contacts_group_month_idx on public.parent_contact_actions (group_id, month);
create index parent_contacts_player_month_idx on public.parent_contact_actions (player_id, month);
create index parent_contacts_coach_idx on public.parent_contact_actions (coach_id);
create index parent_contacts_created_by_idx on public.parent_contact_actions (created_by);
create index monthly_star_awards_theme_idx on public.monthly_star_awards (theme_id);
create index monthly_star_awards_player_idx on public.monthly_star_awards (player_id);
create index monthly_star_awards_selected_by_idx on public.monthly_star_awards (selected_by);
create index monthly_star_awards_updated_by_idx on public.monthly_star_awards (updated_by);
create index monthly_star_awards_revoked_by_idx on public.monthly_star_awards (revoked_by) where revoked_by is not null;

create or replace function private.prepare_behavior_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_group_id uuid;
  event_group_id uuid;
  coach_name text;
begin
  select p.group_id into player_group_id from public.players p where p.id = new.player_id;
  if player_group_id is null or player_group_id <> new.group_id then
    raise exception 'PLAYER_GROUP_MISMATCH' using errcode = '23514';
  end if;

  if new.event_id is not null then
    select e.group_id into event_group_id from public.events e where e.id = new.event_id;
    if event_group_id is null or event_group_id <> new.group_id then
      raise exception 'EVENT_GROUP_MISMATCH' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' and new.coach_id is null then new.coach_id := (select auth.uid()); end if;
  select p.full_name into coach_name from public.profiles p where p.id = new.coach_id;
  new.coach_name_snapshot := coalesce(nullif(trim(new.coach_name_snapshot), ''), coach_name, 'Видалений тренер');
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.prepare_parent_contact_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_group_id uuid;
  coach_name text;
begin
  select p.group_id into player_group_id from public.players p where p.id = new.player_id;
  if player_group_id is null or player_group_id <> new.group_id then
    raise exception 'PLAYER_GROUP_MISMATCH' using errcode = '23514';
  end if;
  if new.coach_id is null then new.coach_id := (select auth.uid()); end if;
  if new.created_by is null then new.created_by := (select auth.uid()); end if;
  select p.full_name into coach_name from public.profiles p where p.id = new.coach_id;
  new.coach_name_snapshot := coalesce(nullif(trim(new.coach_name_snapshot), ''), coach_name, 'Видалений тренер');
  return new;
end;
$$;

create or replace function private.validate_monthly_star_award()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_group_id uuid;
  theme_month date;
  active_cards integer;
begin
  select p.group_id into player_group_id from public.players p where p.id = new.player_id;
  if player_group_id is null or player_group_id <> new.group_id then
    raise exception 'PLAYER_GROUP_MISMATCH' using errcode = '23514';
  end if;

  select t.month into theme_month from public.monthly_star_themes t where t.id = new.theme_id;
  if theme_month is null or theme_month <> new.month then
    raise exception 'THEME_MONTH_MISMATCH' using errcode = '23514';
  end if;

  if new.revoked_at is null then
    select count(*)::integer into active_cards
    from public.player_behavior_cards c
    where c.player_id = new.player_id and c.month = new.month and not c.is_voided;
    if active_cards >= 4 then
      raise exception 'PLAYER_INELIGIBLE_FOR_MONTHLY_STAR' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' and new.selected_by is null then new.selected_by := (select auth.uid()); end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.revoke_ineligible_monthly_star_award()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_cards integer;
begin
  if new.is_voided then return new; end if;
  select count(*)::integer into active_cards
  from public.player_behavior_cards c
  where c.player_id = new.player_id and c.month = new.month and not c.is_voided;

  if active_cards >= 4 then
    update public.monthly_star_awards a
    set revoked_at = now(),
        revoked_by = coalesce((select auth.uid()), new.coach_id),
        revocation_reason = 'Автоматично скасовано: 4 активні жовті картки за місяць',
        updated_by = coalesce((select auth.uid()), new.coach_id),
        updated_at = now()
    where a.player_id = new.player_id and a.month = new.month and a.revoked_at is null;
  end if;
  return new;
end;
$$;

create trigger behavior_cards_prepare
before insert or update on public.player_behavior_cards
for each row execute function private.prepare_behavior_card();

create trigger behavior_cards_revoke_ineligible_award
after insert or update of is_voided, player_id, group_id, occurred_on on public.player_behavior_cards
for each row execute function private.revoke_ineligible_monthly_star_award();

create trigger parent_contacts_prepare
before insert on public.parent_contact_actions
for each row execute function private.prepare_parent_contact_action();

create trigger monthly_star_awards_validate
before insert or update on public.monthly_star_awards
for each row execute function private.validate_monthly_star_award();

create trigger monthly_star_themes_set_updated_at
before update on public.monthly_star_themes
for each row execute function private.set_updated_at();

create or replace function public.void_behavior_card(p_card_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.player_behavior_cards%rowtype;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'VOID_REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into target from public.player_behavior_cards where id = p_card_id for update;
  if target.id is null then raise exception 'CARD_NOT_FOUND' using errcode = 'P0002'; end if;
  if not ((select private.is_admin()) or (select private.has_group(target.group_id))) then
    raise exception 'CARD_ACCESS_DENIED' using errcode = '42501';
  end if;
  if target.is_voided then return; end if;
  update public.player_behavior_cards
  set is_voided = true,
      voided_at = now(),
      voided_by = (select auth.uid()),
      void_reason = trim(p_reason),
      updated_at = now()
  where id = p_card_id;
end;
$$;

revoke all on function private.prepare_behavior_card() from public;
revoke all on function private.prepare_parent_contact_action() from public;
revoke all on function private.validate_monthly_star_award() from public;
revoke all on function private.revoke_ineligible_monthly_star_award() from public;
revoke all on function public.void_behavior_card(uuid, text) from public;
grant execute on function public.void_behavior_card(uuid, text) to authenticated;

alter table public.monthly_star_themes enable row level security;
alter table public.player_behavior_cards enable row level security;
alter table public.parent_contact_actions enable row level security;
alter table public.monthly_star_awards enable row level security;

create policy monthly_star_themes_staff_read on public.monthly_star_themes
for select to authenticated
using ((select private.is_active_user()));

create policy monthly_star_themes_admin_all on public.monthly_star_themes
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy behavior_cards_group_read on public.player_behavior_cards
for select to authenticated
using ((select private.is_admin()) or (select private.has_group(group_id)));

create policy behavior_cards_coach_insert on public.player_behavior_cards
for insert to authenticated
with check (
  (select private.has_group(group_id))
  and coach_id = (select auth.uid())
  and not is_voided
);

create policy behavior_cards_admin_all on public.player_behavior_cards
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy parent_contacts_group_read on public.parent_contact_actions
for select to authenticated
using ((select private.is_admin()) or (select private.has_group(group_id)));

create policy parent_contacts_coach_insert on public.parent_contact_actions
for insert to authenticated
with check (
  (select private.has_group(group_id))
  and coach_id = (select auth.uid())
  and created_by = (select auth.uid())
);

create policy parent_contacts_admin_all on public.parent_contact_actions
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy monthly_star_awards_group_read on public.monthly_star_awards
for select to authenticated
using ((select private.is_admin()) or (select private.has_group(group_id)));

create policy monthly_star_awards_coach_insert on public.monthly_star_awards
for insert to authenticated
with check ((select private.has_group(group_id)) and selected_by = (select auth.uid()));

create policy monthly_star_awards_coach_update on public.monthly_star_awards
for update to authenticated
using ((select private.has_group(group_id)))
with check ((select private.has_group(group_id)) and updated_by = (select auth.uid()));

create policy monthly_star_awards_admin_all on public.monthly_star_awards
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

revoke all on public.monthly_star_themes, public.player_behavior_cards, public.parent_contact_actions, public.monthly_star_awards from anon;
grant select, insert, update, delete on public.monthly_star_themes to authenticated;
grant select, insert, update, delete on public.player_behavior_cards to authenticated;
grant select, insert, update, delete on public.parent_contact_actions to authenticated;
grant select, insert, update, delete on public.monthly_star_awards to authenticated;

create trigger monthly_star_themes_audit
after insert or update or delete on public.monthly_star_themes
for each row execute function private.audit_change();

create trigger behavior_cards_audit
after insert or update or delete on public.player_behavior_cards
for each row execute function private.audit_change();

create trigger parent_contacts_audit
after insert or update or delete on public.parent_contact_actions
for each row execute function private.audit_change();

create trigger monthly_star_awards_audit
after insert or update or delete on public.monthly_star_awards
for each row execute function private.audit_change();

commit;
