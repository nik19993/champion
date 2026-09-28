begin;

drop policy if exists behavior_cards_coach_insert on public.player_behavior_cards;
create policy behavior_cards_coach_insert on public.player_behavior_cards
for insert to authenticated
with check (
  player_behavior_cards.event_id is not null
  and (select private.has_group(player_behavior_cards.group_id))
  and player_behavior_cards.coach_id = (select auth.uid())
  and not player_behavior_cards.is_voided
  and exists (
    select 1
    from public.events event_row
    where event_row.id = player_behavior_cards.event_id
      and event_row.group_id = player_behavior_cards.group_id
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
