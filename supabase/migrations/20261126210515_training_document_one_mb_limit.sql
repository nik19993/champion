-- Only new uploads are limited. Existing clean documents remain readable.
do $$
begin
  if not exists(select 1 from storage.buckets where id='task-documents') then
    raise exception 'Training document bucket is missing';
  end if;
  update storage.buckets set file_size_limit=1000000 where id='task-documents';
end;
$$;
