create function public.replace_methodology_section(p_section_id uuid,p_asset_id uuid,p_title text,p_description text,p_expected jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid; expected_count integer; matched_count integer; actual_count integer;
begin
 if (select auth.uid()) is null or not (select private.is_admin()) then raise exception 'Administrator MFA required' using errcode='42501'; end if;
 perform 1 from public.methodology_sections where id=p_section_id and is_active for update;
 if not found then raise exception 'SECTION_NOT_FOUND'; end if;
 if p_expected is null or jsonb_typeof(p_expected)<>'array' then raise exception 'INVALID_EXPECTED_ROWS'; end if;
 if not exists(select 1 from public.file_assets where id=p_asset_id and owner_id=(select auth.uid()) and bucket='methodology' and scan_status='clean') then raise exception 'VALIDATED_ASSET_REQUIRED' using errcode='42501'; end if;
 select count(*) into expected_count from jsonb_to_recordset(p_expected) as x(id uuid,updated_at timestamptz);
 select count(*) into actual_count from public.methodology_section_materials where section_id=p_section_id and is_active;
 select count(*) into matched_count from public.methodology_section_materials m join jsonb_to_recordset(p_expected) as x(id uuid,updated_at timestamptz) on x.id=m.id and x.updated_at=m.updated_at where m.section_id=p_section_id and m.is_active;
 if matched_count<>expected_count or actual_count<>expected_count or expected_count<>(select count(distinct x.id) from jsonb_to_recordset(p_expected) as x(id uuid)) then raise exception 'CONTENT_CHANGED_RELOAD' using errcode='40001'; end if;
 update public.methodology_section_materials set is_active=false where section_id=p_section_id and is_active;
 insert into public.methodology_section_materials(section_id,file_asset_id,title,description,added_by)
 values(p_section_id,p_asset_id,p_title,p_description,(select auth.uid())) returning id into result_id;
 update public.methodology_sections set bundled_key=null,updated_by=(select auth.uid()) where id=p_section_id;
 return result_id;
end; $$;
revoke all on function public.replace_methodology_section(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.replace_methodology_section(uuid,uuid,text,text,jsonb) to authenticated;

