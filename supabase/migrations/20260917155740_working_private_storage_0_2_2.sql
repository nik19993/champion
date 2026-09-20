-- Private object storage. Existing buckets are tightened to the architecture limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('methodology', 'methodology', false, 26214400, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png','image/webp']),
  ('task-documents', 'task-documents', false, 20971520, array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp']),
  ('player-photos', 'player-photos', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic']),
  ('imports', 'imports', false, 10485760, array['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('exports', 'exports', false, 52428800, array['text/csv','application/json','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists methodology_read_active_staff on storage.objects;
drop policy if exists private_files_admin_insert on storage.objects;
drop policy if exists private_files_admin_update on storage.objects;
drop policy if exists private_files_admin_delete on storage.objects;
drop policy if exists private_files_admin_read on storage.objects;

create policy private_objects_authorized_read on storage.objects for select to authenticated
using ((select private.can_read_storage_object(bucket_id, name)));
create policy private_objects_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id in ('methodology','task-documents','player-photos','imports','exports')
  and (select private.is_active_user())
  and ((select private.is_admin()) or (bucket_id = 'task-documents' and (storage.foldername(name))[1] = (select auth.uid())::text))
);
create policy private_objects_owner_delete on storage.objects for delete to authenticated
using (((select private.is_admin()) and not exists (
  select 1 from public.file_assets f
  where f.bucket = bucket_id and f.object_path = name
    and (
      exists (select 1 from public.player_photos p where p.file_asset_id = f.id)
      or exists (select 1 from public.event_materials e where e.file_asset_id = f.id)
      or exists (select 1 from public.methodology_materials m where m.file_asset_id = f.id)
      or exists (select 1 from public.import_jobs i where i.file_asset_id = f.id)
      or exists (select 1 from public.export_jobs x where x.file_asset_id = f.id)
    )
)) or (
  bucket_id = 'task-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    not exists (select 1 from public.file_assets f where f.bucket = bucket_id and f.object_path = name)
    or exists (select 1 from public.file_assets f where f.bucket = bucket_id and f.object_path = name and f.owner_id = (select auth.uid()) and f.scan_status in ('pending', 'rejected'))
  )
));
create policy private_objects_admin_update on storage.objects for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
