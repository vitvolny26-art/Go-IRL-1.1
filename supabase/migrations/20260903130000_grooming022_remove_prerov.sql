-- GROOMING022: remove Prerov from active Beauty application/backend city policy.
-- Forward-only repository migration. Historical GROOMING018 migrations remain immutable.
-- Production apply requires separate explicit approval.

begin;

do $preflight$
declare
  v_signature text;
begin
  if to_regclass('public.beauty_professional_profiles') is null
    or to_regclass('public.beauty_master_onboarding_claims') is null then
    raise exception 'GROOMING022 requires current Beauty profile and onboarding claim tables';
  end if;

  if to_regprocedure('public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz)') is null then
    raise exception 'GROOMING022 requires the current Beauty master prepare RPC';
  end if;

  foreach v_signature in array array[
    'public.go_irl_list_public_beauty_professionals(text)',
    'public.go_irl_list_public_beauty_professionals_v2(text,text)',
    'public.go_irl_list_public_beauty_professionals_v3(text,text)',
    'public.go_irl_list_public_beauty_availability(uuid,uuid,date,date)',
    'public.go_irl_create_beauty_booking(uuid,uuid,timestamptz,text,text,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'GROOMING022 missing required Beauty runtime function: %', v_signature;
    end if;
  end loop;

  if exists (
    select 1
    from public.beauty_professional_profiles
    where city_id is distinct from 'olomouc'
  ) then
    raise exception 'GROOMING022 refuses to tighten city policy while non-Olomouc Beauty profiles exist';
  end if;

  if exists (
    select 1
    from public.beauty_master_onboarding_claims
    where claimed_at is null
      and revoked_at is null
      and expires_at > now()
      and coalesce(approved_payload ->> 'cityId', '') <> 'olomouc'
  ) then
    raise exception 'GROOMING022 refuses to tighten city policy while an active non-Olomouc onboarding claim exists';
  end if;
end
$preflight$;

alter table public.beauty_professional_profiles
  drop constraint if exists beauty_professional_profiles_city_check;
alter table public.beauty_professional_profiles
  add constraint beauty_professional_profiles_city_check
  check (city_id = 'olomouc');

drop policy if exists "beauty profiles owner insert" on public.beauty_professional_profiles;
create policy "beauty profiles owner insert"
on public.beauty_professional_profiles for insert to authenticated
with check (
  owner_user_key = public.go_irl_auth_user_key()
  and city_id = 'olomouc'
  and public.go_irl_current_user_is_professional()
);

drop policy if exists "beauty profiles owner update" on public.beauty_professional_profiles;
create policy "beauty profiles owner update"
on public.beauty_professional_profiles for update to authenticated
using (
  owner_user_key = public.go_irl_auth_user_key()
  and public.go_irl_current_user_is_professional()
)
with check (
  owner_user_key = public.go_irl_auth_user_key()
  and city_id = 'olomouc'
  and public.go_irl_current_user_is_professional()
);

-- Preserve the current runtime function bodies and narrow only the city guards
-- that GROOMING018 previously expanded from Olomouc to Olomouc + Prerov.
do $runtime_city_patch$
declare
  v_signature regprocedure;
  v_definition text;
  v_original text;
  v_signatures text[] := array[
    'public.go_irl_list_public_beauty_professionals(text)',
    'public.go_irl_list_public_beauty_professionals_v2(text,text)',
    'public.go_irl_list_public_beauty_professionals_v3(text,text)',
    'public.go_irl_list_public_beauty_availability(uuid,uuid,date,date)',
    'public.go_irl_create_beauty_booking(uuid,uuid,timestamptz,text,text,text)'
  ];
  v_name text;
begin
  foreach v_name in array v_signatures loop
    v_signature := to_regprocedure(v_name);
    select pg_get_functiondef(v_signature) into v_definition;
    v_original := v_definition;

    v_definition := replace(
      v_definition,
      'p_requested_city_id in (''olomouc'', ''prerov'')',
      'p_requested_city_id = ''olomouc'''
    );
    v_definition := replace(
      v_definition,
      'profile.city_id in (''olomouc'', ''prerov'')',
      'profile.city_id = ''olomouc'''
    );

    if v_definition = v_original then
      raise exception 'GROOMING022 expected expanded city guard not found in %', v_name;
    end if;
    if position('prerov' in lower(v_definition)) > 0 then
      raise exception 'GROOMING022 Prerov marker remains in runtime function %', v_name;
    end if;

    execute v_definition;
  end loop;
end
$runtime_city_patch$;

-- Keep the current prepare RPC implementation and narrow only its approved city contract.
do $prepare_city_patch$
declare
  v_signature regprocedure := 'public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz)'::regprocedure;
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_original := v_definition;

  v_definition := replace(
    v_definition,
    'p_approved_payload ->> ''cityId'' not in (''olomouc'',''prerov'')',
    'p_approved_payload ->> ''cityId'' <> ''olomouc'''
  );

  if v_definition = v_original then
    raise exception 'GROOMING022 expected expanded prepare city guard not found';
  end if;
  if position('prerov' in lower(v_definition)) > 0 then
    raise exception 'GROOMING022 Prerov marker remains in Beauty master prepare RPC';
  end if;

  execute v_definition;
end
$prepare_city_patch$;

notify pgrst, 'reload schema';

commit;
