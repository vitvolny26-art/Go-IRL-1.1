-- Read-only structural verification for Beauty workspace ownership transfer.
-- Run only after separately approved production migration apply.

do $verify$
declare
  v_definition text;
begin
  if to_regclass('public.beauty_workspace_ownership_transfers') is null then
    raise exception 'verify: ownership transfer table missing';
  end if;

  if to_regprocedure('public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz)') is null
    or to_regprocedure('public.go_irl_claim_beauty_workspace_owner_transfer(text,text)') is null
    or to_regprocedure('public.go_irl_get_beauty_workspace_owner_transfer_status(text,text)') is null
    or to_regprocedure('public.go_irl_list_pending_beauty_workspace_owner_transfers(text)') is null
    or to_regprocedure('public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text)') is null then
    raise exception 'verify: ownership transfer RPC contract missing';
  end if;

  if has_table_privilege('authenticated', 'public.beauty_workspace_ownership_transfers', 'SELECT')
    or has_table_privilege('authenticated', 'public.beauty_workspace_ownership_transfers', 'INSERT')
    or has_table_privilege('authenticated', 'public.beauty_workspace_ownership_transfers', 'UPDATE')
    or has_table_privilege('service_role', 'public.beauty_workspace_ownership_transfers', 'SELECT') then
    raise exception 'verify: direct transfer table access must remain revoked';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz)',
      'EXECUTE'
    ) then
    raise exception 'verify: owner request RPC grant missing';
  end if;

  if has_function_privilege(
      'authenticated',
      'public.go_irl_claim_beauty_workspace_owner_transfer(text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.go_irl_claim_beauty_workspace_owner_transfer(text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text)',
      'EXECUTE'
    ) then
    raise exception 'verify: service/admin privilege boundary incorrect';
  end if;

  select pg_get_functiondef('public.go_irl_claim_beauty_workspace_owner_transfer(text,text)'::regprocedure)
  into v_definition;
  if position('FOR UPDATE' in upper(v_definition)) = 0
    or position('pending_superadmin' in v_definition) = 0
    or position('profile_conflict' in v_definition) = 0 then
    raise exception 'verify: candidate claim locking/guards incomplete';
  end if;

  select pg_get_functiondef('public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text)'::regprocedure)
  into v_definition;
  if position('role.role = ''superadmin''' in v_definition) = 0
    or position('FOR UPDATE' in upper(v_definition)) = 0
    or position('owner_user_key = v_transfer.candidate_user_key' in v_definition) = 0
    or position('beauty_workspace_ownership_transfer.approved' in v_definition) = 0 then
    raise exception 'verify: superadmin/atomic approval contract incomplete';
  end if;
end
$verify$;

select
  'beauty_workspace_owner_transfer_structural_verification_passed' as verification,
  to_regclass('public.beauty_workspace_ownership_transfers')::text as transfer_table,
  to_regprocedure('public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz)')::text as request_rpc,
  to_regprocedure('public.go_irl_claim_beauty_workspace_owner_transfer(text,text)')::text as claim_rpc,
  to_regprocedure('public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text)')::text as decide_rpc;
