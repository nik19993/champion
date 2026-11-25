set local lock_timeout = '5s';

-- Clear the visible archive without deleting attendance, awards, payments or
-- invalidating completed training registers that reference former players.
alter table public.players add column archive_cleared_at timestamptz;
alter table public.players add constraint players_archive_cleared_inactive
check (archive_cleared_at is null or not is_active);
comment on column public.players.archive_cleared_at is
  'Removed from the visible inactive-player archive. Historical references remain; not a physical data-erasure marker.';
create index players_visible_archive_idx on public.players(full_name,id)
where not is_active and archive_cleared_at is null;

create function private.normalize_player_archive_clear()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.is_active or (tg_op='UPDATE' and old.is_active) then
    new.archive_cleared_at := null;
  elsif (tg_op='INSERT' and new.archive_cleared_at is not null)
    or (tg_op='UPDATE' and new.archive_cleared_at is distinct from old.archive_cleared_at) then
    if not (select private.is_admin()) and coalesce(current_setting('role',true),'none') not in ('none','postgres','service_role') then
      raise exception 'ARCHIVE_CLEAR_ADMIN_REQUIRED' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.normalize_player_archive_clear() from public;
create trigger players_normalize_archive_clear before insert or update of is_active,archive_cleared_at on public.players
for each row execute function private.normalize_player_archive_clear();
