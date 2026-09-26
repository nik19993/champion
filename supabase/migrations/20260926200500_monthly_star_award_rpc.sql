begin;

create or replace function public.save_monthly_star_awards(
  p_group_id uuid,
  p_month date,
  p_theme_id uuid,
  p_coach_choice uuid,
  p_team_choice uuid,
  p_correction_note text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if p_coach_choice is null or p_team_choice is null or p_coach_choice = p_team_choice then
    raise exception 'TWO_DIFFERENT_WINNERS_REQUIRED' using errcode = '22023';
  end if;
  if extract(day from p_month) <> 1 then
    raise exception 'MONTH_START_REQUIRED' using errcode = '22023';
  end if;
  if not ((select private.is_admin()) or (select private.has_group(p_group_id))) then
    raise exception 'MONTHLY_STAR_ACCESS_DENIED' using errcode = '42501';
  end if;

  update public.monthly_star_awards
  set revoked_at = now(),
      revoked_by = actor_id,
      revocation_reason = case when nullif(trim(coalesce(p_correction_note, '')), '') is null
        then 'Замінено під час підтвердження результатів'
        else trim(p_correction_note)
      end,
      updated_by = actor_id,
      updated_at = now()
  where group_id = p_group_id and month = p_month and revoked_at is null;

  insert into public.monthly_star_awards (
    month, group_id, theme_id, award_type, player_id, selected_by, correction_note, updated_by
  ) values
    (p_month, p_group_id, p_theme_id, 'coach_choice', p_coach_choice, actor_id, nullif(trim(coalesce(p_correction_note, '')), ''), actor_id),
    (p_month, p_group_id, p_theme_id, 'team_choice', p_team_choice, actor_id, nullif(trim(coalesce(p_correction_note, '')), ''), actor_id);
end;
$$;

revoke all on function public.save_monthly_star_awards(uuid, date, uuid, uuid, uuid, text) from public;
grant execute on function public.save_monthly_star_awards(uuid, date, uuid, uuid, uuid, text) to authenticated;

commit;
