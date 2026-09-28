begin;

create or replace function public.register_player_photo_asset(
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_group_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  asset_id uuid;
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = caller_id
      and profile.role = 'coach'
      and profile.status = 'active'
  ) or not (select private.has_group(p_group_id)) then
    raise exception 'PLAYER_PHOTO_GROUP_ACCESS_DENIED' using errcode = '42501';
  end if;
  if p_object_path is null
     or p_object_path !~ ('^' || caller_id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
     or length(p_object_path) > 240 then
    raise exception 'INVALID_PLAYER_PHOTO_PATH' using errcode = '22023';
  end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'INVALID_PLAYER_PHOTO_TYPE' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 8388608 then
    raise exception 'INVALID_PLAYER_PHOTO_SIZE' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_original_name, '')), '') is null or length(p_original_name) > 255 then
    raise exception 'INVALID_PLAYER_PHOTO_NAME' using errcode = '22023';
  end if;

  insert into public.file_assets (
    owner_id,
    bucket,
    object_path,
    original_name,
    mime_type,
    size_bytes,
    context_type,
    context_group_id,
    context_age
  ) values (
    caller_id,
    'player-photos',
    p_object_path,
    p_original_name,
    p_mime_type,
    p_size_bytes,
    'player_photo',
    p_group_id,
    null
  )
  returning id into asset_id;

  return asset_id;
end;
$$;

revoke all on function public.register_player_photo_asset(text, text, text, bigint, uuid) from public;
grant execute on function public.register_player_photo_asset(text, text, text, bigint, uuid) to authenticated;

commit;
