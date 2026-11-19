set local lock_timeout = '5s';

alter table public.uniform_requests
  add column issued_at timestamptz,
  add constraint uniform_request_issued_at_status
    check (issued_at is null or status = 'issued');

comment on column public.uniform_requests.issued_at is
  'Time the issue was recorded. Existing issued requests are left undated and outside the new archive.';

create function private.set_uniform_request_issued_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status <> 'issued' then
    new.issued_at := null;
  elsif tg_op = 'INSERT' then
    new.issued_at := statement_timestamp();
  elsif old.status <> 'issued' then
    new.issued_at := statement_timestamp();
  else
    new.issued_at := old.issued_at;
  end if;
  return new;
end;
$function$;

revoke execute on function private.set_uniform_request_issued_at() from public, anon, authenticated;

create trigger uniform_requests_set_issued_at
before insert or update on public.uniform_requests
for each row execute function private.set_uniform_request_issued_at();
