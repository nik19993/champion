begin;

-- Player photos are scoped by the assigned group, not by an editable age value.
-- Task documents keep their existing group/age restriction.
drop policy if exists file_assets_owner_insert on public.file_assets;
create policy file_assets_owner_insert on public.file_assets
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and (
    (select private.is_admin())
    or (
      context_group_id is not null
      and (select private.has_group(context_group_id))
      and (
        (
          bucket = 'player-photos'
          and context_type = 'player_photo'
          and context_age is null
        )
        or (
          bucket = 'task-documents'
          and exists (
            select 1
            from public.groups group_row
            where group_row.id = context_group_id
              and (
                (group_row.group_kind = 'age' and context_age = group_row.age)
                or (group_row.group_kind = 'goalkeeper' and context_age is null)
              )
          )
        )
      )
    )
  )
);

-- Behaviour cards belong only to a real training event. Competitions, tournaments,
-- championships and theory events keep attendance but cannot receive these cards.
create or replace function private.prepare_behavior_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_group_id uuid;
  event_group_id uuid;
  linked_event_type text;
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

  if new.event_id is null then
    raise exception 'BEHAVIOR_CARD_EVENT_REQUIRED' using errcode = '23514';
  end if;

  select event_row.group_id, event_row.event_type::text
  into event_group_id, linked_event_type
  from public.events event_row
  where event_row.id = new.event_id;
  if event_group_id is null or event_group_id <> new.group_id then
    raise exception 'EVENT_GROUP_MISMATCH' using errcode = '23514';
  end if;
  if linked_event_type <> 'training' then
    raise exception 'BEHAVIOR_CARD_TRAINING_ONLY' using errcode = '23514';
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

drop policy if exists behavior_cards_coach_insert on public.player_behavior_cards;
create policy behavior_cards_coach_insert on public.player_behavior_cards
for insert to authenticated
with check (
  event_id is not null
  and (select private.has_group(group_id))
  and coach_id = (select auth.uid())
  and not is_voided
  and exists (
    select 1
    from public.events event_row
    where event_row.id = event_id
      and event_row.group_id = group_id
      and event_row.event_type = 'training'
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'coach'
      and profile.status = 'active'
  )
);

commit;
