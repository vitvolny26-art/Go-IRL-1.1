-- PEOPLE003B: owner-only team rename/delete; no existing rows are modified by this migration.
begin;
create or replace function public.go_irl_named_team_manage(
  p_team_id uuid, p_action text, p_name text default null
) returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_owner text;
begin
  if auth.role() is distinct from 'authenticated' or v_actor is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_team_id is null or p_action is null or p_action not in ('rename','delete') then
    raise exception 'invalid_team_action' using errcode = '22023';
  end if;
  select owner_user_key into v_owner from public.named_teams where id = p_team_id for update;
  if v_owner is null or v_owner is distinct from v_actor then
    raise exception 'team_permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.named_team_memberships
    where team_id = p_team_id and user_key = v_actor and role = 'owner' and status = 'active'
  ) then
    raise exception 'team_permission_denied' using errcode = '42501';
  end if;
  if p_action = 'rename' then
    if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
      raise exception 'invalid_named_team_name' using errcode = '22023';
    end if;
    update public.named_teams set name = btrim(p_name), updated_at = now() where id = p_team_id;
  else
    if p_name is not null then
      raise exception 'invalid_team_action' using errcode = '22023';
    end if;
    delete from public.named_teams where id = p_team_id;
  end if;
end;
$$;
revoke all on function public.go_irl_named_team_manage(uuid,text,text) from public, anon;
grant execute on function public.go_irl_named_team_manage(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
