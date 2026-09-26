begin;

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
  if tg_op = 'UPDATE' and not (select private.is_admin()) then
    if (to_jsonb(new) - array['is_voided', 'voided_at', 'voided_by', 'void_reason', 'updated_at'])
       is distinct from
       (to_jsonb(old) - array['is_voided', 'voided_at', 'voided_by', 'void_reason', 'updated_at'])
       or old.is_voided
       or not new.is_voided
       or new.voided_by <> (select auth.uid())
       or nullif(trim(coalesce(new.void_reason, '')), '') is null then
      raise exception 'ONLY_CARD_VOIDING_IS_ALLOWED' using errcode = '42501';
    end if;
  end if;

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

create or replace function public.void_behavior_card(p_card_id uuid, p_reason text)
returns void
language plpgsql
security invoker
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

drop policy if exists behavior_cards_coach_void on public.player_behavior_cards;
create policy behavior_cards_coach_void on public.player_behavior_cards
for update to authenticated
using ((select private.has_group(group_id)))
with check (
  (select private.has_group(group_id))
  and is_voided
  and voided_by = (select auth.uid())
  and void_reason is not null
);

revoke all on function public.void_behavior_card(uuid, text) from public;
grant execute on function public.void_behavior_card(uuid, text) to authenticated;

commit;
