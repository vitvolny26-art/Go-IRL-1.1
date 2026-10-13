-- PEOPLE003C: bounded, team-scoped discovery and roster; no existing data writes.
begin;
create or replace function public.go_irl_named_team_people(
  p_team_id uuid, p_mode text, p_query text default null
) returns table(user_key text, display_name text, username text, role text, status text)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_role text;
  v_query text := btrim(coalesce(p_query,''));
begin
  if auth.role() is distinct from 'authenticated' or v_actor is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if p_team_id is null or p_mode is null or p_mode not in ('search','roster') then
    raise exception 'invalid_team_people_request' using errcode='22023';
  end if;
  select m.role into v_role from public.named_team_memberships m
    where m.team_id=p_team_id and m.user_key=v_actor and m.status='active';
  if v_role is null then
    raise exception 'team_permission_denied' using errcode='42501';
  end if;
  if p_mode='search' then
    if v_role not in ('owner','admin') then
      raise exception 'team_permission_denied' using errcode='42501';
    end if;
    if char_length(v_query) not between 3 and 80 then
      raise exception 'invalid_search_query' using errcode='22023';
    end if;
    return query
      select u.user_key,
        coalesce(nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),nullif(u.username,''),'User')::text,
        u.username, null::text, null::text
      from public.app_users u
      where u.user_key<>v_actor
        and (u.status is null or u.status='active')
        and not exists (
          select 1 from public.named_team_memberships m
          where m.team_id=p_team_id and m.user_key=u.user_key and m.status in ('active','invited')
        )
        and (coalesce(u.first_name,'') ilike '%'||replace(replace(replace(v_query,'\\','\\\\'),'%','\\%'),'_','\\_')||'%' escape '\\'
          or coalesce(u.last_name,'') ilike '%'||replace(replace(replace(v_query,'\\','\\\\'),'%','\\%'),'_','\\_')||'%' escape '\\'
          or coalesce(u.username,'') ilike '%'||replace(replace(replace(v_query,'\\','\\\\'),'%','\\%'),'_','\\_')||'%' escape '\\')
      order by u.username nulls last, u.user_key limit 10;
  else
    return query
      select u.user_key,
        coalesce(nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),nullif(u.username,''),'User')::text,
        u.username, m.role, m.status
      from public.named_team_memberships m join public.app_users u on u.user_key=m.user_key
      where m.team_id=p_team_id and m.status in ('active','invited')
      order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,u.user_key
      limit 100;
  end if;
end;
$$;
revoke all on function public.go_irl_named_team_people(uuid,text,text) from public,anon;
grant execute on function public.go_irl_named_team_people(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
