begin;

-- PostgreSQL recomputes generated columns after BEFORE triggers. Excluding the generated
-- month value keeps the immutable-history comparison focused on user-writable fields.
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
    if (to_jsonb(new) - array['month', 'is_voided', 'voided_at', 'voided_by', 'void_reason', 'updated_at'])
       is distinct from
       (to_jsonb(old) - array['month', 'is_voided', 'voided_at', 'voided_by', 'void_reason', 'updated_at'])
       or old.is_voided
       or not new.is_voided
       or new.voided_by <> (select auth.uid())
       or nullif(trim(coalesce(new.void_reason, '')), '') is null then
      raise exception 'ONLY_CARD_VOIDING_IS_ALLOWED' using errcode = '42501';
    end if;
  end if;

  select player.group_id into player_group_id
  from public.players player
  where player.id = new.player_id;
  if player_group_id is null or player_group_id <> new.group_id then
    raise exception 'PLAYER_GROUP_MISMATCH' using errcode = '23514';
  end if;

  if new.event_id is not null then
    select event_row.group_id into event_group_id
    from public.events event_row
    where event_row.id = new.event_id;
    if event_group_id is null or event_group_id <> new.group_id then
      raise exception 'EVENT_GROUP_MISMATCH' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' and new.coach_id is null then new.coach_id := (select auth.uid()); end if;
  select profile.full_name into coach_name
  from public.profiles profile
  where profile.id = new.coach_id;
  new.coach_name_snapshot := coalesce(nullif(trim(new.coach_name_snapshot), ''), coach_name, 'Видалений тренер');
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_behavior_card() from public;

commit;
