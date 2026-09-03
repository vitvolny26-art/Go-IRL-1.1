-- GROOMING018-J read-only structural verification.
-- Run only after a separately approved production migration apply.

do $verify$
declare
  v_definition text;
  v_default text;
  v_security_definer boolean;
  v_search_path text[];
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'beauty_professional_profiles'
      and column_name = 'management_state'
      and is_nullable = 'NO'
  ) then
    raise exception 'GROOMING018-J verify: management_state column missing/not-null contract broken';
  end if;

  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'beauty_professional_profiles'
    and column_name = 'management_state';

  if v_default is null or position('master_managed' in v_default) = 0 then
    raise exception 'GROOMING018-J verify: legacy-safe master_managed default missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.beauty_professional_profiles'::regclass
      and conname = 'beauty_professional_profiles_management_state_check'
      and pg_get_constraintdef(oid) like '%platform_managed%'
      and pg_get_constraintdef(oid) like '%master_managed%'
      and pg_get_constraintdef(oid) not like '%handoff_pending%'
  ) then
    raise exception 'GROOMING018-J verify: durable management-state constraint incorrect';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'beauty_workspace_ownership_transfers'
      and column_name = 'transfer_kind'
      and is_nullable = 'NO'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'beauty_workspace_ownership_transfers'
      and column_name = 'initiated_by_superadmin_user_key'
  ) then
    raise exception 'GROOMING018-J verify: transfer-kind/initiator schema missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.beauty_workspace_ownership_transfers'::regclass
      and conname = 'beauty_workspace_owner_transfer_kind_check'
      and pg_get_constraintdef(oid) like '%owner_transfer%'
      and pg_get_constraintdef(oid) like '%platform_handoff%'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.beauty_workspace_ownership_transfers'::regclass
      and conname = 'beauty_workspace_owner_transfer_initiator_check'
      and pg_get_constraintdef(oid) like '%initiated_by_superadmin_user_key%'
  ) then
    raise exception 'GROOMING018-J verify: transfer-kind consistency constraints missing';
  end if;

  if to_regprocedure('public.go_irl_beauty_assert_superadmin(text)') is null
    or to_regprocedure('public.go_irl_beauty_workspace_revision(uuid)') is null
    or to_regprocedure('public.go_irl_admin_list_beauty_workspaces(text)') is null
    or to_regprocedure('public.go_irl_admin_get_beauty_workspace(uuid,text)') is null
    or to_regprocedure('public.go_irl_admin_save_beauty_workspace(uuid,jsonb,timestamptz,text)') is null
    or to_regprocedure('public.go_irl_admin_adopt_beauty_workspace(uuid,timestamptz,text)') is null
    or to_regprocedure('public.go_irl_prepare_beauty_platform_handoff(uuid,text,timestamptz,text)') is null
    or to_regprocedure('public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz)') is null
    or to_regprocedure('public.go_irl_claim_beauty_workspace_owner_transfer(text,text)') is null
    or to_regprocedure('public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text)') is null then
    raise exception 'GROOMING018-J verify: required RPC contract missing';
  end if;

  if has_function_privilege('authenticated', 'public.go_irl_admin_list_beauty_workspaces(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.go_irl_admin_get_beauty_workspace(uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.go_irl_admin_save_beauty_workspace(uuid,jsonb,timestamptz,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.go_irl_admin_adopt_beauty_workspace(uuid,timestamptz,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.go_irl_prepare_beauty_platform_handoff(uuid,text,timestamptz,text)', 'EXECUTE') then
    raise exception 'GROOMING018-J verify: admin RPC leaked to authenticated';
  end if;

  if not has_function_privilege('service_role', 'public.go_irl_admin_list_beauty_workspaces(text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.go_irl_admin_get_beauty_workspace(uuid,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.go_irl_admin_save_beauty_workspace(uuid,jsonb,timestamptz,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.go_irl_admin_adopt_beauty_workspace(uuid,timestamptz,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.go_irl_prepare_beauty_platform_handoff(uuid,text,timestamptz,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.go_irl_claim_beauty_workspace_owner_transfer(text,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text)', 'EXECUTE') then
    raise exception 'GROOMING018-J verify: service-role RPC grant missing';
  end if;

  if not has_function_privilege('authenticated', 'public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz)', 'EXECUTE') then
    raise exception 'GROOMING018-J verify: legacy owner request grant was lost';
  end if;

  select p.prosecdef, p.proconfig
  into v_security_definer, v_search_path
  from pg_proc p
  where p.oid = 'public.go_irl_admin_save_beauty_workspace(uuid,jsonb,timestamptz,text)'::regprocedure;

  if not v_security_definer
    or v_search_path is null
    or not ('search_path=pg_catalog, public' = any(v_search_path)) then
    raise exception 'GROOMING018-J verify: admin save definer/search_path contract incorrect';
  end if;

  select pg_get_functiondef('public.go_irl_admin_save_beauty_workspace(uuid,jsonb,timestamptz,text)'::regprocedure)
  into v_definition;
  if position('go_irl_beauty_assert_superadmin' in v_definition) = 0
    or position('FOR UPDATE' in upper(v_definition)) = 0
    or position('p_expected_updated_at is null' in v_definition) = 0
    or position('beauty_workspace_admin.saved' in v_definition) = 0
    or position('management_state =' in v_definition) > 0
    or position('owner_user_key =' in v_definition) > 0 then
    raise exception 'GROOMING018-J verify: admin save authorization/CAS/audit/non-impersonation contract incorrect';
  end if;

  select pg_get_functiondef('public.go_irl_admin_get_beauty_workspace(uuid,text)'::regprocedure)
  into v_definition;
  if position('handoff_pending' in v_definition) = 0
    or position('transfer.transfer_kind = ''platform_handoff''' in v_definition) = 0
    or position('transfer.expires_at > now()' in v_definition) = 0 then
    raise exception 'GROOMING018-J verify: derived handoff lifecycle contract missing';
  end if;

  select pg_get_functiondef('public.go_irl_admin_adopt_beauty_workspace(uuid,timestamptz,text)'::regprocedure)
  into v_definition;
  if position('management_state = ''platform_managed''' in v_definition) = 0
    or position('beauty_workspace_management.adopted' in v_definition) = 0
    or position('transfer_active' in v_definition) = 0 then
    raise exception 'GROOMING018-J verify: explicit platform adoption contract incomplete';
  end if;

  select pg_get_functiondef('public.go_irl_prepare_beauty_platform_handoff(uuid,text,timestamptz,text)'::regprocedure)
  into v_definition;
  if position('transfer_kind' in v_definition) = 0
    or position('''platform_handoff''' in v_definition) = 0
    or position('initiated_by_superadmin_user_key' in v_definition) = 0
    or position('beauty_workspace_platform_handoff.prepared' in v_definition) = 0
    or position('FOR UPDATE' in upper(v_definition)) = 0 then
    raise exception 'GROOMING018-J verify: platform handoff preparation contract incomplete';
  end if;

  select pg_get_functiondef('public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz)'::regprocedure)
  into v_definition;
  if position('v_profile.management_state <> ''master_managed''' in v_definition) = 0
    or position('''owner_transfer''' in v_definition) = 0 then
    raise exception 'GROOMING018-J verify: platform-managed owner-transfer guard missing';
  end if;

  select pg_get_functiondef('public.go_irl_claim_beauty_workspace_owner_transfer(text,text)'::regprocedure)
  into v_definition;
  if position('v_transfer.transfer_kind = ''platform_handoff''' in v_definition) = 0
    or position('owner_user_key = p_candidate_user_key' in v_definition) = 0
    or position('management_state = ''master_managed''' in v_definition) = 0
    or position('decided_by_user_key = v_transfer.initiated_by_superadmin_user_key' in v_definition) = 0
    or position('beauty_workspace_platform_handoff.approved' in v_definition) = 0
    or position('''pending_superadmin''' in v_definition) = 0
    or position('FOR UPDATE' in upper(v_definition)) = 0 then
    raise exception 'GROOMING018-J verify: atomic platform handoff / legacy owner-transfer split incomplete';
  end if;

  select pg_get_functiondef('public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text)'::regprocedure)
  into v_definition;
  if position('v_transfer.transfer_kind <> ''owner_transfer''' in v_definition) = 0
    or position('management_state = ''master_managed''' in v_definition) = 0
    or position('go_irl_beauty_assert_superadmin' in v_definition) = 0 then
    raise exception 'GROOMING018-J verify: owner-transfer decision isolation incomplete';
  end if;
end
$verify$;

select
  'grooming018j_beauty_cabinet_lifecycle_structural_verification_passed' as verification,
  to_regprocedure('public.go_irl_admin_list_beauty_workspaces(text)')::text as list_rpc,
  to_regprocedure('public.go_irl_admin_get_beauty_workspace(uuid,text)')::text as get_rpc,
  to_regprocedure('public.go_irl_admin_save_beauty_workspace(uuid,jsonb,timestamptz,text)')::text as save_rpc,
  to_regprocedure('public.go_irl_prepare_beauty_platform_handoff(uuid,text,timestamptz,text)')::text as handoff_rpc,
  to_regprocedure('public.go_irl_claim_beauty_workspace_owner_transfer(text,text)')::text as claim_rpc;
