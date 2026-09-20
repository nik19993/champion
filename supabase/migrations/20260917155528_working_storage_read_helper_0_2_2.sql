create or replace function private.can_read_storage_object(requested_bucket text, requested_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.file_assets f
    where f.bucket = requested_bucket and f.object_path = requested_path
      and f.scan_status = 'clean'
      and (select private.can_read_file_asset(f.id))
  );
$$;
