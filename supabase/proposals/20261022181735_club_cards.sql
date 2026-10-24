-- UNAPPLIED. Requires the training-register proposal. Isolated tests only.
begin;
create table public.player_club_cards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  group_id uuid not null references public.groups(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  coach_id uuid references public.profiles(id) on delete set null,
  coach_name_snapshot text not null,
  occurred_on date not null,
  comment text check (length(comment) <= 2000),
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_voided or (voided_at is not null and nullif(trim(void_reason),'') is not null))
);
create unique index club_cards_player_event_active on public.player_club_cards(event_id,player_id) where not is_voided;
create index club_cards_player_idx on public.player_club_cards(player_id);
create index club_cards_group_idx on public.player_club_cards(group_id);
create index club_cards_coach_idx on public.player_club_cards(coach_id);
create index club_cards_voided_by_idx on public.player_club_cards(voided_by);
alter table public.player_club_cards enable row level security;
create policy club_cards_group_read on public.player_club_cards for select to authenticated
  using ((select private.is_admin()) or (select private.has_group(group_id)));
revoke all on public.player_club_cards from public,anon,authenticated;
grant select on public.player_club_cards to authenticated;
create trigger club_cards_audit after insert or update or delete on public.player_club_cards
  for each row execute function private.audit_change();
create trigger club_cards_register_changed after insert or update or delete on public.player_club_cards
  for each row execute function private.invalidate_training_register();
alter table public.training_register_completions add column club_card_count integer not null default 0 check (club_card_count >= 0);

create function private.record_club_card(p_event_id uuid,p_player_id uuid,p_comment text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.events%rowtype; card_id uuid; coach_name text;
begin
  if (select auth.uid()) is null or not (select private.is_active_user()) then
    raise exception 'CLUB_CARD_ACCESS_DENIED' using errcode='42501'; end if;
  select * into target from public.events where id=p_event_id for update;
  if target.id is null or target.event_type<>'training' or target.status='cancelled' then
    raise exception 'CLUB_CARD_TRAINING_REQUIRED' using errcode='23514'; end if;
  if not ((select private.is_admin()) or ((select private.has_group(target.group_id)) and exists
    (select 1 from public.profiles where id=(select auth.uid()) and role='coach' and status='active'))) then
    raise exception 'CLUB_CARD_ACCESS_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.players where id=p_player_id and group_id=target.group_id and is_active)
    or not exists(select 1 from public.attendance_records r join public.attendance_sessions s on s.id=r.session_id
      where s.event_id=target.id and s.completed_at is not null and r.player_id=p_player_id and r.status='present') then
    raise exception 'CLUB_CARD_ATTENDANCE_REQUIRED' using errcode='23514'; end if;
  if length(coalesce(p_comment,''))>2000 then raise exception 'CLUB_CARD_COMMENT_TOO_LONG' using errcode='22023'; end if;
  -- Retry/double click is idempotent; it cannot add a second active card.
  select id into card_id from public.player_club_cards where event_id=target.id and player_id=p_player_id and not is_voided;
  if card_id is not null then return card_id; end if;
  select full_name into coach_name from public.profiles where id=(select auth.uid());
  insert into public.player_club_cards(player_id,group_id,event_id,coach_id,coach_name_snapshot,occurred_on,comment)
    values(p_player_id,target.group_id,target.id,(select auth.uid()),coach_name,(target.start_at at time zone 'Europe/Kyiv')::date,nullif(trim(p_comment),''))
    returning id into card_id;
  return card_id;
end; $$;
create function public.record_club_card(p_event_id uuid,p_player_id uuid,p_comment text default null)
returns uuid language sql security invoker set search_path='' as $$select private.record_club_card(p_event_id,p_player_id,p_comment)$$;

create function private.void_club_card(p_card_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare card public.player_club_cards%rowtype;
begin
  if (select auth.uid()) is null or not (select private.is_active_user()) then raise exception 'CLUB_CARD_ACCESS_DENIED' using errcode='42501'; end if;
  select * into card from public.player_club_cards where id=p_card_id;
  if card.id is null then raise exception 'CLUB_CARD_NOT_FOUND' using errcode='P0002'; end if;
  if not ((select private.is_admin()) or ((select private.has_group(card.group_id)) and exists
    (select 1 from public.profiles where id=(select auth.uid()) and role='coach' and status='active'))) then
    raise exception 'CLUB_CARD_ACCESS_DENIED' using errcode='42501'; end if;
  if nullif(trim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'VOID_REASON_REQUIRED' using errcode='22023'; end if;
  perform id from public.events where id=card.event_id for update;
  select * into card from public.player_club_cards where id=p_card_id for update;
  if card.is_voided then return; end if;
  update public.player_club_cards set is_voided=true,voided_at=now(),voided_by=(select auth.uid()),void_reason=trim(p_reason),updated_at=now() where id=card.id;
end; $$;
create function public.void_club_card(p_card_id uuid,p_reason text)
returns void language sql security invoker set search_path='' as $$select private.void_club_card(p_card_id,p_reason)$$;

-- Keeps the original four-argument RPC compatible and its summaries accurate.
create function private.training_register_club_summary() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.completed_at is not null and exists (
    select 1 from public.player_club_cards c where c.event_id=new.event_id and not c.is_voided
      and not exists(select 1 from public.attendance_records r join public.attendance_sessions s on s.id=r.session_id
        where s.event_id=new.event_id and r.player_id=c.player_id and r.status='present')
  ) then raise exception 'REGISTER_CARD_ATTENDANCE_MISMATCH' using errcode='23514'; end if;
  select count(*) into new.club_card_count from public.player_club_cards where event_id=new.event_id and not is_voided;
  return new;
end; $$;
create trigger training_register_club_summary before insert or update on public.training_register_completions
for each row execute function private.training_register_club_summary();

create function private.complete_training_register_with_club_cards(p_event_id uuid,p_expected_attendance_version integer,p_expected_card_ids uuid[],p_expected_club_card_ids uuid[],p_expected_records jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_group uuid; actual_ids uuid[]; expected_ids uuid[];
begin
  if (select auth.uid()) is null or not (select private.is_active_user()) then raise exception 'REGISTER_ACCESS_DENIED' using errcode='42501'; end if;
  select group_id into target_group from public.events where id=p_event_id for update;
  if target_group is null or not ((select private.is_admin()) or (select private.has_group(target_group))) then
    raise exception 'REGISTER_ACCESS_DENIED' using errcode='42501'; end if;
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into actual_ids from public.player_club_cards where event_id=p_event_id and not is_voided;
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into expected_ids from unnest(p_expected_club_card_ids) as supplied(id);
  if p_expected_club_card_ids is null or actual_ids<>expected_ids then raise exception 'REGISTER_CHANGED' using errcode='40001'; end if;
  return private.complete_training_register(p_event_id,p_expected_attendance_version,p_expected_card_ids,p_expected_records);
end; $$;
create function public.complete_training_register_with_club_cards(p_event_id uuid,p_expected_attendance_version integer,p_expected_card_ids uuid[],p_expected_club_card_ids uuid[],p_expected_records jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.complete_training_register_with_club_cards(p_event_id,p_expected_attendance_version,p_expected_card_ids,p_expected_club_card_ids,p_expected_records)
$$;
revoke all on function private.record_club_card(uuid,uuid,text),public.record_club_card(uuid,uuid,text),private.void_club_card(uuid,text),public.void_club_card(uuid,text),private.complete_training_register_with_club_cards(uuid,integer,uuid[],uuid[],jsonb),public.complete_training_register_with_club_cards(uuid,integer,uuid[],uuid[],jsonb) from public,anon;
grant execute on function private.record_club_card(uuid,uuid,text),public.record_club_card(uuid,uuid,text),private.void_club_card(uuid,text),public.void_club_card(uuid,text),private.complete_training_register_with_club_cards(uuid,integer,uuid[],uuid[],jsonb),public.complete_training_register_with_club_cards(uuid,integer,uuid[],uuid[],jsonb) to authenticated;
revoke all on function private.training_register_club_summary() from public,anon,authenticated;
commit;
