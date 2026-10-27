-- UProfile017 role-interest persistence verification.
-- Safe to run in production: all functional test rows are inside one transaction and rolled back.

begin;

do $$
declare
  v_function_oid oid;
  v_function_config text;
begin
  if to_regclass('public.user_profile_role_interests') is null then
    raise exception 'user_profile_role_interests table missing';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.user_profile_role_interests'::regclass
  ) then
    raise exception 'role-interest RLS disabled';
  end if;

  if has_table_privilege('anon', 'public.user_profile_role_interests', 'SELECT')
     or has_table_privilege('anon', 'public.user_profile_role_interests', 'INSERT')
     or has_table_privilege('anon', 'public.user_profile_role_interests', 'UPDATE')
     or has_table_privilege('anon', 'public.user_profile_role_interests', 'DELETE') then
    raise exception 'anon role-interest table access allowed';
  end if;

  if not has_table_privilege('authenticated', 'public.user_profile_role_interests', 'SELECT')
     or not has_table_privilege('authenticated', 'public.user_profile_role_interests', 'INSERT')
     or not has_table_privilege('authenticated', 'public.user_profile_role_interests', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.user_profile_role_interests', 'DELETE') then
    raise exception 'authenticated role-interest grants incomplete';
  end if;

  select p.oid, array_to_string(coalesce(p.proconfig, array[]::text[]), ',')
  into v_function_oid, v_function_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'go_irl_save_my_profile_role_interests'
    and pg_get_function_identity_arguments(p.oid) = 'p_role_interests jsonb';

  if v_function_oid is null then
    raise exception 'role-interest save RPC missing';
  end if;

  if (select p.prosecdef from pg_proc p where p.oid = v_function_oid) then
    raise exception 'role-interest save RPC must remain SECURITY INVOKER';
  end if;

  if v_function_config not like '%search_path=pg_catalog, public%' then
    raise exception 'role-interest save RPC search_path mismatch: %', v_function_config;
  end if;

  if has_function_privilege('anon', v_function_oid, 'EXECUTE') then
    raise exception 'anon role-interest save RPC execute allowed';
  end if;

  if not has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'role-interest save RPC execute grant missing';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.user_profile_role_interests'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.app_users'::regclass
      and c.confdeltype = 'c'
  ) then
    raise exception 'role-interest app_users cascade FK missing';
  end if;

  if position(
    'public.user_profile_role_interests'
    in pg_get_functiondef('public.go_irl_transfer_google_identity(text,text)'::regprocedure)
  ) = 0 then
    raise exception 'Google identity transfer role-interest guard missing';
  end if;

  if position(
    'public.user_profile_role_interests'
    in pg_get_functiondef('public.go_irl_transfer_facebook_identity(text,text)'::regprocedure)
  ) = 0 then
    raise exception 'Facebook identity transfer role-interest guard missing';
  end if;
end;
$$;

insert into public.app_users (
  auth_provider,
  provider_user_id,
  user_key,
  telegram_id,
  first_name
)
values
  ('telegram', 'uprofile017-role-verify-a', 'telegram:990017001', 990017001, 'Role Verify A'),
  ('telegram', 'uprofile017-role-verify-b', 'telegram:990017002', 990017002, 'Role Verify B');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","go_irl_user_key":"telegram:990017001"}',
  true
);

select *
from public.go_irl_save_my_profile_role_interests(
  '[{"role_id":"driver","interest_level":"want_to_try"},{"role_id":"translator","interest_level":"professional"}]'::jsonb
);

do $$
begin
  if (
    select count(*)
    from public.user_profile_role_interests
    where user_key = 'telegram:990017001'
  ) <> 2 then
    raise exception 'role-interest atomic save failed';
  end if;

  begin
    perform *
    from public.go_irl_save_my_profile_role_interests(
      '[{"role_id":"driver","interest_level":"admin"}]'::jsonb
    );
    raise exception 'invalid interest level accepted';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    perform *
    from public.go_irl_save_my_profile_role_interests(
      '[{"role_id":"driver","interest_level":"can_help"},{"role_id":"driver","interest_level":"professional"}]'::jsonb
    );
    raise exception 'duplicate role payload accepted';
  exception when sqlstate '22023' then
    null;
  end;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","go_irl_user_key":"telegram:990017002"}',
  true
);

do $$
begin
  if (
    select count(*)
    from public.user_profile_role_interests
    where user_key = 'telegram:990017001'
  ) <> 0 then
    raise exception 'cross-user role-interest read allowed';
  end if;

  begin
    insert into public.user_profile_role_interests(user_key, role_id, interest_level)
    values ('telegram:990017001', 'guide', 'can_help');
    raise exception 'cross-user role-interest insert allowed';
  exception when sqlstate '42501' then
    null;
  end;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","go_irl_user_key":"telegram:990017001"}',
  true
);

select *
from public.go_irl_save_my_profile_role_interests('[]'::jsonb);

do $$
begin
  if (
    select count(*)
    from public.user_profile_role_interests
    where user_key = 'telegram:990017001'
  ) <> 0 then
    raise exception 'role-interest clear failed';
  end if;
end;
$$;

reset role;
rollback;
