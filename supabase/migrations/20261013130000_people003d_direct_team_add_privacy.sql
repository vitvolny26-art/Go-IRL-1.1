begin;
create table if not exists public.named_team_join_preferences (
  user_key text primary key references public.app_users(user_key) on delete cascade,
  block_direct_add boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.named_team_join_preferences enable row level security;
revoke all on public.named_team_join_preferences from public,anon,authenticated;
create or replace function public.go_irl_named_team_join_preference(p_block boolean default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor text := public.go_irl_auth_user_key(); v_value boolean;
begin
  if auth.role() is distinct from 'authenticated' or v_actor is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if p_block is not null then
    insert into public.named_team_join_preferences(user_key,block_direct_add)
      values(v_actor,p_block)
    on conflict(user_key) do update set block_direct_add=excluded.block_direct_add,updated_at=now();
  end if;
  select block_direct_add into v_value from public.named_team_join_preferences where user_key=v_actor;
  return coalesce(v_value,false);
end;
$$;
revoke all on function public.go_irl_named_team_join_preference(boolean) from public,anon;
grant execute on function public.go_irl_named_team_join_preference(boolean) to authenticated;

create or replace function public.go_irl_named_team_membership_action(
  p_team_id uuid,p_action text,p_target_user_key text default null
) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_actor text:=public.go_irl_auth_user_key();
 v_owner text;v_actor_role text;v_target_role text;v_target_status text;v_target text;
begin
 if auth.role() is distinct from 'authenticated' or v_actor is null then
   raise exception 'authentication_required' using errcode='42501';
 end if;
 if p_action is null or p_action not in ('invite','add','accept','decline','leave','remove') then
   raise exception 'invalid_team_action' using errcode='22023';
 end if;
 select owner_user_key into v_owner from public.named_teams where id=p_team_id for update;
 if v_owner is null then raise exception 'team_not_found' using errcode='42501'; end if;
 select role into v_actor_role from public.named_team_memberships
   where team_id=p_team_id and user_key=v_actor and status='active';
 v_target:=case when p_action in ('accept','decline','leave') then v_actor else nullif(btrim(p_target_user_key),'') end;
 if v_target is null then raise exception 'target_required' using errcode='22023'; end if;
 select role,status into v_target_role,v_target_status from public.named_team_memberships
   where team_id=p_team_id and user_key=v_target for update;
 if p_action in ('invite','add') then
   if v_actor_role is null or v_actor_role not in ('owner','admin') or v_target=v_actor then
     raise exception 'team_permission_denied' using errcode='42501';
   end if;
   if not exists(select 1 from public.app_users where user_key=v_target) then
     raise exception 'target_not_found' using errcode='22023';
   end if;
   if v_target_role='owner' or v_target_status in ('active','invited') then
     raise exception 'target_already_member' using errcode='23505';
   end if;
   if p_action='add' and exists(select 1 from public.named_team_join_preferences
      where user_key=v_target and block_direct_add=true) then
     raise exception 'direct_team_add_blocked' using errcode='42501';
   end if;
   insert into public.named_team_memberships(team_id,user_key,role,status)
     values(p_team_id,v_target,'member',case when p_action='add' then 'active' else 'invited' end)
     on conflict(team_id,user_key) do update
       set role='member',status=excluded.status,updated_at=now();
 elsif p_action in ('accept','decline') then
   if v_target_status is distinct from 'invited' then
     raise exception 'invitation_not_found' using errcode='42501';
   end if;
   update public.named_team_memberships
     set status=case when p_action='accept' then 'active' else 'declined' end,updated_at=now()
     where team_id=p_team_id and user_key=v_actor;
 elsif p_action='leave' then
   if v_target_status is distinct from 'active' or v_target_role='owner' then
     raise exception 'cannot_leave_team' using errcode='42501';
   end if;
   update public.named_team_memberships set status='left',updated_at=now()
     where team_id=p_team_id and user_key=v_actor;
 else
   if v_target=v_actor or v_target_status is distinct from 'active'
     or v_actor_role is null
     or (v_actor_role<>'owner' and not(v_actor_role='admin' and v_target_role='member'))
     or v_target_role='owner' then
     raise exception 'team_permission_denied' using errcode='42501';
   end if;
   update public.named_team_memberships set status='removed',updated_at=now()
     where team_id=p_team_id and user_key=v_target;
 end if;
end;
$$;
revoke all on function public.go_irl_named_team_membership_action(uuid,text,text) from public,anon;
grant execute on function public.go_irl_named_team_membership_action(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;