create or replace function private.validate_file_asset_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := (select auth.uid());
    new.scan_status := 'pending';
    new.checksum := null;
  elsif new.owner_id is distinct from old.owner_id
    or new.bucket is distinct from old.bucket
    or new.object_path is distinct from old.object_path
    or new.scan_status is distinct from old.scan_status
    or new.checksum is distinct from old.checksum then
    raise exception 'File security fields are server-managed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger file_asset_validate before insert or update on public.file_assets
for each row execute function private.validate_file_asset_write();
