-- Explicit transfer only: no deletion or rewriting of historic records.
-- Definer is private because coaches have no general UPDATE privilege on players.
create function private.transfer_player_group(p_player_id uuid, p_target_group_id uuid, p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.players%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Group access required' using errcode='42501'; end if;
  select * into target from public.players where id=p_player_id and is_active for update;
  if target.id is null or not private.can_manage_player_group(target.group_id)
    or not private.can_manage_player_group(p_target_group_id) then
    raise exception 'Group access required' using errcode='42501';
  end if;
  if p_expected_updated_at is null or target.updated_at is distinct from p_expected_updated_at then
    raise exception 'PLAYER_CHANGED_RELOAD' using errcode='40001';
  end if;
  if p_target_group_id is null or p_target_group_id=target.group_id then
    raise exception 'DIFFERENT_GROUP_REQUIRED' using errcode='22023';
  end if;
  perform id from public.groups where id=p_target_group_id and is_active for update;
  if not found then raise exception 'ACTIVE_GROUP_REQUIRED' using errcode='22023'; end if;
  if exists(select 1 from public.players where group_id=p_target_group_id and is_active
    and lower(trim(full_name))=lower(trim(target.full_name)) and id<>p_player_id) then
    raise exception 'PLAYER_NAME_AMBIGUOUS' using errcode='23505';
  end if;
  update public.players set group_id=p_target_group_id,updated_by=(select auth.uid()) where id=p_player_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,old_values,new_values)
    values((select auth.uid()),'transfer','players',p_player_id,
      jsonb_build_object('group_id',target.group_id),jsonb_build_object('group_id',p_target_group_id));
  return p_player_id;
end;
$$;
revoke all on function private.transfer_player_group(uuid,uuid,timestamptz) from public,anon;
grant execute on function private.transfer_player_group(uuid,uuid,timestamptz) to authenticated;
create function public.transfer_player_group(p_player_id uuid,p_target_group_id uuid,p_expected_updated_at timestamptz)
returns uuid language sql security invoker set search_path = '' as $$
  select private.transfer_player_group(p_player_id,p_target_group_id,p_expected_updated_at);
$$;
revoke all on function public.transfer_player_group(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.transfer_player_group(uuid,uuid,timestamptz) to authenticated;
