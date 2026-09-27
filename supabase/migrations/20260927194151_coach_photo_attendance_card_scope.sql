begin;

-- A coach may upload a player photo only into the coach's own private folder.
drop policy if exists private_objects_owner_insert on storage.objects;
create policy private_objects_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id in ('methodology', 'task-documents', 'player-photos', 'imports', 'exports')
  and (select private.is_active_user())
  and (
    (select private.is_admin())
    or (
      bucket_id in ('task-documents', 'player-photos')
      and (storage.foldername(name))[1] = (select auth.uid())::text
    )
  )
);

-- Preserve linked objects. Coaches may clean up only their own failed or unattached uploads.
drop policy if exists private_objects_owner_delete on storage.objects;
create policy private_objects_owner_delete on storage.objects
for delete to authenticated
using (
  (
    (select private.is_admin())
    and not exists (
      select 1
      from public.file_assets f
      where f.bucket = bucket_id
        and f.object_path = name
        and (
          exists (select 1 from public.player_photos p where p.file_asset_id = f.id)
          or exists (select 1 from public.event_materials e where e.file_asset_id = f.id)
          or exists (select 1 from public.methodology_materials m where m.file_asset_id = f.id)
          or exists (select 1 from public.methodology_section_materials sm where sm.file_asset_id = f.id)
          or exists (select 1 from public.import_jobs i where i.file_asset_id = f.id)
          or exists (select 1 from public.export_jobs x where x.file_asset_id = f.id)
        )
    )
  )
  or (
    bucket_id in ('task-documents', 'player-photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      not exists (
        select 1 from public.file_assets f
        where f.bucket = bucket_id and f.object_path = name
      )
      or exists (
        select 1
        from public.file_assets f
        where f.bucket = bucket_id
          and f.object_path = name
          and f.owner_id = (select auth.uid())
          and (
            f.scan_status in ('pending', 'rejected')
            or (
              bucket_id = 'player-photos'
              and not exists (
                select 1 from public.player_photos p where p.file_asset_id = f.id
              )
            )
          )
      )
    )
  )
);

drop policy if exists file_assets_owner_insert on public.file_assets;
create policy file_assets_owner_insert on public.file_assets
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and (
    (select private.is_admin())
    or (
      bucket in ('task-documents', 'player-photos')
      and context_group_id is not null
      and (select private.has_group(context_group_id))
      and (
        bucket = 'task-documents'
        or context_type = 'player_photo'
      )
      and exists (
        select 1
        from public.groups g
        where g.id = context_group_id
          and (
            (g.group_kind = 'age' and context_age = g.age)
            or (g.group_kind = 'goalkeeper' and context_age is null)
          )
      )
    )
  )
);

drop policy if exists file_assets_owner_delete_unlinked_photo on public.file_assets;
create policy file_assets_owner_delete_unlinked_photo on public.file_assets
for delete to authenticated
using (
  bucket = 'player-photos'
  and owner_id = (select auth.uid())
  and not exists (
    select 1 from public.player_photos p where p.file_asset_id = file_assets.id
  )
);

create or replace function public.set_player_photo(
  p_player_id uuid,
  p_file_asset_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_group_id uuid;
  asset public.file_assets%rowtype;
  existing_photo_id uuid;
  new_photo_id uuid;
begin
  if actor_id is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = actor_id
      and profile.role = 'coach'
      and profile.status = 'active'
  ) then
    raise exception 'COACH_REQUIRED' using errcode = '42501';
  end if;

  select player.group_id
  into target_group_id
  from public.players player
  where player.id = p_player_id and player.is_active
  for update;

  if target_group_id is null or not (select private.has_group(target_group_id)) then
    raise exception 'PLAYER_PHOTO_ACCESS_DENIED' using errcode = '42501';
  end if;

  select *
  into asset
  from public.file_assets file_asset
  where file_asset.id = p_file_asset_id
  for update;

  if asset.id is null
     or asset.owner_id <> actor_id
     or asset.bucket <> 'player-photos'
     or asset.context_type <> 'player_photo'
     or asset.context_group_id is distinct from target_group_id
     or asset.scan_status <> 'clean' then
    raise exception 'INVALID_PLAYER_PHOTO_ASSET' using errcode = '23514';
  end if;

  select photo.id
  into existing_photo_id
  from public.player_photos photo
  where photo.player_id = p_player_id
    and photo.file_asset_id = p_file_asset_id
    and photo.is_current;

  if existing_photo_id is not null then
    return existing_photo_id;
  end if;

  if exists (
    select 1
    from public.player_photos photo
    where photo.file_asset_id = p_file_asset_id
  ) then
    raise exception 'PLAYER_PHOTO_ASSET_ALREADY_USED' using errcode = '23505';
  end if;

  update public.player_photos
  set is_current = false
  where player_id = p_player_id and is_current;

  insert into public.player_photos (player_id, file_asset_id, is_current)
  values (p_player_id, p_file_asset_id, true)
  returning id into new_photo_id;

  return new_photo_id;
end;
$$;

revoke all on function public.set_player_photo(uuid, uuid) from public;
grant execute on function public.set_player_photo(uuid, uuid) to authenticated;

drop trigger if exists player_photos_audit on public.player_photos;
create trigger player_photos_audit
after insert or update or delete on public.player_photos
for each row execute function private.audit_change();

-- Keep the first active card for an event and retain later copies as voided audit history.
with ranked_cards as (
  select
    card.id,
    row_number() over (
      partition by card.player_id, card.event_id
      order by card.created_at, card.id
    ) as copy_number
  from public.player_behavior_cards card
  where card.event_id is not null and not card.is_voided
), duplicate_cards as (
  select id from ranked_cards where copy_number > 1
)
update public.player_behavior_cards card
set is_voided = true,
    voided_at = now(),
    voided_by = coalesce(
      card.coach_id,
      (
        select profile.id
        from public.profiles profile
        where profile.role = 'admin' and profile.status = 'active'
        order by profile.created_at
        limit 1
      )
    ),
    void_reason = 'Автоматично анульовано як дубль картки тієї самої події',
    updated_at = now()
from duplicate_cards duplicate
where card.id = duplicate.id;

create unique index if not exists behavior_cards_event_player_active_idx
on public.player_behavior_cards (event_id, player_id)
where event_id is not null and not is_voided;

-- Cards and monthly-star winners are created and corrected only by assigned coaches.
drop policy if exists behavior_cards_admin_all on public.player_behavior_cards;
drop policy if exists behavior_cards_coach_insert on public.player_behavior_cards;
create policy behavior_cards_coach_insert on public.player_behavior_cards
for insert to authenticated
with check (
  event_id is not null
  and (select private.has_group(group_id))
  and coach_id = (select auth.uid())
  and not is_voided
  and exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'coach'
      and profile.status = 'active'
  )
);

drop policy if exists behavior_cards_coach_void on public.player_behavior_cards;
create policy behavior_cards_coach_void on public.player_behavior_cards
for update to authenticated
using (
  (select private.has_group(group_id))
  and exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'coach'
      and profile.status = 'active'
  )
)
with check (
  (select private.has_group(group_id))
  and is_voided
  and voided_by = (select auth.uid())
  and void_reason is not null
);

drop policy if exists monthly_star_awards_admin_all on public.monthly_star_awards;
drop policy if exists monthly_star_awards_coach_insert on public.monthly_star_awards;
create policy monthly_star_awards_coach_insert on public.monthly_star_awards
for insert to authenticated
with check (
  (select private.has_group(group_id))
  and selected_by = (select auth.uid())
  and exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'coach'
      and profile.status = 'active'
  )
);

drop policy if exists monthly_star_awards_coach_update on public.monthly_star_awards;
create policy monthly_star_awards_coach_update on public.monthly_star_awards
for update to authenticated
using (
  (select private.has_group(group_id))
  and exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'coach'
      and profile.status = 'active'
  )
)
with check (
  (select private.has_group(group_id))
  and updated_by = (select auth.uid())
);

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
  if not exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'coach'
      and profile.status = 'active'
  ) then
    raise exception 'COACH_REQUIRED' using errcode = '42501';
  end if;
  select * into target from public.player_behavior_cards where id = p_card_id for update;
  if target.id is null then raise exception 'CARD_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (select private.has_group(target.group_id)) then
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
  if not exists (
    select 1 from public.profiles profile
    where profile.id = actor_id
      and profile.role = 'coach'
      and profile.status = 'active'
  ) or not (select private.has_group(p_group_id)) then
    raise exception 'MONTHLY_STAR_ACCESS_DENIED' using errcode = '42501';
  end if;

  update public.monthly_star_awards
  set revoked_at = now(),
      revoked_by = actor_id,
      revocation_reason = 'Оновлено тренером групи',
      updated_by = actor_id,
      updated_at = now()
  where group_id = p_group_id and month = p_month and revoked_at is null;

  insert into public.monthly_star_awards (
    month, group_id, theme_id, award_type, player_id, selected_by, correction_note, updated_by
  ) values
    (p_month, p_group_id, p_theme_id, 'coach_choice', p_coach_choice, actor_id, null, actor_id),
    (p_month, p_group_id, p_theme_id, 'team_choice', p_team_choice, actor_id, null, actor_id);
end;
$$;

revoke all on function public.void_behavior_card(uuid, text) from public;
grant execute on function public.void_behavior_card(uuid, text) to authenticated;
revoke all on function public.save_monthly_star_awards(uuid, date, uuid, uuid, uuid, text) from public;
grant execute on function public.save_monthly_star_awards(uuid, date, uuid, uuid, uuid, text) to authenticated;

commit;
