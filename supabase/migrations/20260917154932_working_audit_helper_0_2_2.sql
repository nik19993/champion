create or replace function private.audit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  row_id uuid;
  changed_keys text[];
begin
  row_id := coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'id')::uuid, null);
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into changed_keys
    from jsonb_each(to_jsonb(new)) n
    left join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value and n.key not in ('updated_at');
  end if;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), lower(tg_op), tg_table_name, row_id, jsonb_build_object('changed_fields', coalesce(to_jsonb(changed_keys), '[]'::jsonb)));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
