set local lock_timeout = '5s';

-- The owner confirmed that the archived profiles were test data and requested
-- their removal without retaining copies. The visibility marker is unnecessary.
drop trigger players_normalize_archive_clear on public.players;
drop function private.normalize_player_archive_clear();
drop index public.players_visible_archive_idx;
alter table public.players drop constraint players_archive_cleared_inactive;
alter table public.players drop column archive_cleared_at;
