-- GROOMING018 read-only structural verification.
-- Run only after an explicitly approved production migration apply.
-- This file does not create or mutate customer/application data.

do $verify$
declare
  v_definition text;
  v_constraint text;
  v_signature text;
begin
  if to_regclass('public.beauty_master_onboarding_claims') is null then
    raise exception 'GROOMING018 verify: onboarding claim table missing';
  end if;

  select pg_get_constraintdef(oid)
  into v_constraint
  from pg_constraint
  where conrelid = 'public.beauty_professional_profiles'::regclass
    and conname = 'beauty_professional_profiles_city_check';
  if v_constraint is null
    or position('olomouc' in lower(v_constraint)) = 0
    or position('prerov' in lower(v_constraint)) = 0 then
    raise exception 'GROOMING018 verify: Beauty city constraint is not Olomouc + Prerov aware';
  end if;

  if to_regprocedure('public.go_irl_beauty_i18n_complete(jsonb)') is null
    or to_regprocedure('public.go_irl_beauty_i18n_fits(jsonb,integer)') is null
    or to_regprocedure('public.go_irl_beauty_i18n_sanitize(jsonb,integer)') is null
    or to_regprocedure('public.go_irl_beauty_i18n_pick(jsonb,text,text)') is null
    or to_regprocedure('public.save_my_beauty_profile_v4(text,text,text,text,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,timestamptz)') is null
    or to_regprocedure('public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz)') is null
    or to_regprocedure('public.go_irl_claim_beauty_master_onboarding(text,text)') is null then
    raise exception 'GROOMING018 verify: required function contract missing';
  end if;

  select pg_get_functiondef('public.go_irl_beauty_i18n_sanitize(jsonb,integer)'::regprocedure)
  into v_definition;
  if position('''pl''' in v_definition) = 0 or position('''sk''' in v_definition) = 0 then
    raise exception 'GROOMING018 verify: six-language sanitizer missing PL/SK';
  end if;

  select pg_get_functiondef('public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz)'::regprocedure)
  into v_definition;
  if position('(''admin'',''superadmin'')' in regexp_replace(v_definition, '[[:space:]]+', '', 'g')) = 0
    or position('p_approved_payload is null' in v_definition) = 0
    or position('approval_conflict' in v_definition) = 0
    or position('v_existing_payload is distinct from p_approved_payload' in v_definition) = 0
    or position('(''ru'',''uk'',''cs'',''en'',''pl'',''sk'')' in regexp_replace(v_definition, '[[:space:]]+', '', 'g')) = 0 then
    raise exception 'GROOMING018 verify: prepare authorization/payload guard missing';
  end if;

  select pg_get_functiondef('public.go_irl_claim_beauty_master_onboarding(text,text)'::regprocedure)
  into v_definition;
  if position('FOR UPDATE' in upper(v_definition)) = 0
    or position('''draft''' in v_definition) = 0
    or position('v_current_role = ''user''' in v_definition) = 0
    or position('v_current_role <> ''professional''' in v_definition) = 0
    or position('claimed_at = now()' in v_definition) = 0 then
    raise exception 'GROOMING018 verify: atomic one-time claim contract incomplete';
  end if;

  foreach v_signature in array array[
    'public.go_irl_list_public_beauty_professionals(text)',
    'public.go_irl_list_public_beauty_professionals_v2(text,text)',
    'public.go_irl_list_public_beauty_professionals_v3(text,text)',
    'public.go_irl_list_public_beauty_availability(uuid,uuid,date,date)',
    'public.go_irl_create_beauty_booking(uuid,uuid,timestamptz,text,text,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'GROOMING018 verify: required Beauty runtime function missing: %', v_signature;
    end if;
    execute format('select pg_get_functiondef(%L::regprocedure)', v_signature) into v_definition;
    if position('prerov' in lower(v_definition)) = 0 then
      raise exception 'GROOMING018 verify: Prerov runtime guard missing from %', v_signature;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.beauty_master_onboarding_claims', 'SELECT')
    or has_table_privilege('authenticated', 'public.beauty_master_onboarding_claims', 'INSERT')
    or has_table_privilege('authenticated', 'public.beauty_master_onboarding_claims', 'UPDATE')
    or has_table_privilege('service_role', 'public.beauty_master_onboarding_claims', 'SELECT') then
    raise exception 'GROOMING018 verify: direct onboarding table access must remain revoked';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz)',
      'EXECUTE'
    ) then
    raise exception 'GROOMING018 verify: authenticated prepare grant missing';
  end if;

  if has_function_privilege(
      'authenticated',
      'public.go_irl_claim_beauty_master_onboarding(text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.go_irl_claim_beauty_master_onboarding(text,text)',
      'EXECUTE'
    ) then
    raise exception 'GROOMING018 verify: claim RPC privilege boundary incorrect';
  end if;
end
$verify$;

select
  'grooming018_master_onboarding_structural_verification_passed' as verification,
  to_regclass('public.beauty_master_onboarding_claims')::text as claim_table,
  to_regprocedure('public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz)')::text as prepare_rpc,
  to_regprocedure('public.go_irl_claim_beauty_master_onboarding(text,text)')::text as claim_rpc;
