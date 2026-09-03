-- GROOMING022 read-only structural/runtime verification.
-- Run only after an explicitly approved production migration apply.
-- This file does not create or mutate customer/application data.

do $verify$
declare
  v_definition text;
  v_normalized text;
  v_constraint text;
  v_policy_check text;
  v_signature text;
begin
  if to_regclass('public.beauty_professional_profiles') is null
    or to_regclass('public.beauty_master_onboarding_claims') is null then
    raise exception 'GROOMING022 verify: required Beauty tables missing';
  end if;

  if exists (
    select 1
    from public.beauty_professional_profiles
    where city_id is distinct from 'olomouc'
  ) then
    raise exception 'GROOMING022 verify: non-Olomouc Beauty profile still exists';
  end if;

  if exists (
    select 1
    from public.beauty_master_onboarding_claims
    where claimed_at is null
      and revoked_at is null
      and expires_at > now()
      and coalesce(approved_payload ->> 'cityId', '') <> 'olomouc'
  ) then
    raise exception 'GROOMING022 verify: active non-Olomouc onboarding claim still exists';
  end if;

  select pg_get_constraintdef(oid)
  into v_constraint
  from pg_constraint
  where conrelid = 'public.beauty_professional_profiles'::regclass
    and conname = 'beauty_professional_profiles_city_check';
  if v_constraint is null
    or position('olomouc' in lower(v_constraint)) = 0
    or position('prerov' in lower(v_constraint)) > 0 then
    raise exception 'GROOMING022 verify: Beauty city constraint is not Olomouc-only';
  end if;

  select with_check
  into v_policy_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'beauty_professional_profiles'
    and policyname = 'beauty profiles owner insert';
  if v_policy_check is null
    or position('olomouc' in lower(v_policy_check)) = 0
    or position('prerov' in lower(v_policy_check)) > 0 then
    raise exception 'GROOMING022 verify: owner insert policy is not Olomouc-only';
  end if;

  select with_check
  into v_policy_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'beauty_professional_profiles'
    and policyname = 'beauty profiles owner update';
  if v_policy_check is null
    or position('olomouc' in lower(v_policy_check)) = 0
    or position('prerov' in lower(v_policy_check)) > 0 then
    raise exception 'GROOMING022 verify: owner update policy is not Olomouc-only';
  end if;

  foreach v_signature in array array[
    'public.go_irl_list_public_beauty_professionals(text)',
    'public.go_irl_list_public_beauty_professionals_v2(text,text)',
    'public.go_irl_list_public_beauty_professionals_v3(text,text)',
    'public.go_irl_list_public_beauty_availability(uuid,uuid,date,date)',
    'public.go_irl_create_beauty_booking(uuid,uuid,timestamptz,text,text,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'GROOMING022 verify: required Beauty runtime function missing: %', v_signature;
    end if;
    execute format('select pg_get_functiondef(%L::regprocedure)', v_signature) into v_definition;
    v_normalized := regexp_replace(lower(v_definition), '[[:space:]]+', '', 'g');
    if position('prerov' in v_normalized) > 0
      or (
        position('p_requested_city_id=''olomouc''' in v_normalized) = 0
        and position('profile.city_id=''olomouc''' in v_normalized) = 0
      ) then
      raise exception 'GROOMING022 verify: Olomouc-only runtime guard missing from %', v_signature;
    end if;
  end loop;

  if to_regprocedure('public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz)') is null then
    raise exception 'GROOMING022 verify: Beauty master prepare RPC missing';
  end if;
  select pg_get_functiondef('public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz)'::regprocedure)
  into v_definition;
  v_normalized := regexp_replace(lower(v_definition), '[[:space:]]+', '', 'g');
  if position('prerov' in v_normalized) > 0
    or position('p_approved_payload->>''cityid''<>''olomouc''' in v_normalized) = 0 then
    raise exception 'GROOMING022 verify: Beauty master prepare city guard is not Olomouc-only';
  end if;
end
$verify$;

select
  'grooming022_prerov_removal_verification_passed' as verification,
  'olomouc' as beauty_city_policy,
  to_regprocedure('public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz)')::text as prepare_rpc;
