create or replace function private.validate_payment_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.player_id is distinct from old.player_id or new.month is distinct from old.month) then
    raise exception 'Payment identity cannot be changed' using errcode = '42501';
  end if;
  if (select auth.uid()) is not null then
    new.changed_by := (select auth.uid());
  end if;
  new.changed_at := now();
  return new;
end;
$$;
