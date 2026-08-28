-- GROOMING018: approved Beauty master browser onboarding claim.
-- Repository/local preparation only. Production apply requires separate explicit approval.

begin;

create extension if not exists pgcrypto;

do $preflight$
begin
  if to_regclass('public.app_users') is null
    or to_regclass('public.user_roles') is null
    or to_regclass('public.beauty_professional_profiles') is null
    or to_regclass('public.beauty_professional_services') is null
    or to_regclass('public.beauty_availability_rules') is null
    or to_regclass('public.audit_log') is null then
    raise exception 'GROOMING018 requires current app user, role, Beauty profile/service and availability tables';
  end if;
  if to_regprocedure('public.go_irl_auth_user_key()') is null
    or to_regprocedure('public.go_irl_beauty_i18n_pick(jsonb,text,text)') is null
    or to_regprocedure('public.save_my_beauty_profile_v3(text,text,text,text,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,timestamptz)') is null then
    raise exception 'GROOMING018 requires current trusted auth and Beauty v3 contracts';
  end if;
end
$preflight$;

-- GROOMING018 test intake is in Prerov. Keep expansion bounded to the two explicitly known Beauty cities.
alter table public.beauty_professional_profiles
  drop constraint if exists beauty_professional_profiles_city_check;
alter table public.beauty_professional_profiles
  add constraint beauty_professional_profiles_city_check
  check (city_id in ('olomouc', 'prerov'));

drop policy if exists "beauty profiles owner insert" on public.beauty_professional_profiles;
create policy "beauty profiles owner insert"
on public.beauty_professional_profiles for insert to authenticated
with check (
  owner_user_key = public.go_irl_auth_user_key()
  and city_id in ('olomouc', 'prerov')
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
  and city_id in ('olomouc', 'prerov')
  and public.go_irl_current_user_is_professional()
);

-- Preserve RU/UK/CS/EN and add PL/SK without changing the platform-wide Language type.
create or replace function public.go_irl_beauty_i18n_complete(p_values jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when jsonb_typeof(p_values) <> 'object' then false
    else (select count(*) = 6 from jsonb_object_keys(p_values))
      and coalesce(jsonb_typeof(p_values -> 'ru') = 'string', false)
      and coalesce(jsonb_typeof(p_values -> 'uk') = 'string', false)
      and coalesce(jsonb_typeof(p_values -> 'cs') = 'string', false)
      and coalesce(jsonb_typeof(p_values -> 'en') = 'string', false)
      and coalesce(jsonb_typeof(p_values -> 'pl') = 'string', false)
      and coalesce(jsonb_typeof(p_values -> 'sk') = 'string', false)
  end;
$$;

create or replace function public.go_irl_beauty_i18n_fits(p_values jsonb, p_max_length integer)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select public.go_irl_beauty_i18n_complete(p_values)
    and p_max_length > 0
    and char_length(btrim(p_values ->> 'ru')) <= p_max_length
    and char_length(btrim(p_values ->> 'uk')) <= p_max_length
    and char_length(btrim(p_values ->> 'cs')) <= p_max_length
    and char_length(btrim(p_values ->> 'en')) <= p_max_length
    and char_length(btrim(p_values ->> 'pl')) <= p_max_length
    and char_length(btrim(p_values ->> 'sk')) <= p_max_length;
$$;

create or replace function public.go_irl_beauty_i18n_sanitize(p_values jsonb, p_max_length integer)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'ru', left(btrim(coalesce(p_values ->> 'ru', '')), p_max_length),
    'uk', left(btrim(coalesce(p_values ->> 'uk', '')), p_max_length),
    'cs', left(btrim(coalesce(p_values ->> 'cs', '')), p_max_length),
    'en', left(btrim(coalesce(p_values ->> 'en', '')), p_max_length),
    'pl', left(btrim(coalesce(p_values ->> 'pl', '')), p_max_length),
    'sk', left(btrim(coalesce(p_values ->> 'sk', '')), p_max_length)
  );
$$;

create or replace function public.go_irl_beauty_i18n_pick(
  p_values jsonb,
  p_language text,
  p_fallback text default ''
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select coalesce(
    nullif(btrim(coalesce(p_values ->> case
      when p_language in ('ru', 'uk', 'cs', 'en', 'pl', 'sk') then p_language
      else 'en'
    end, '')), ''),
    nullif(btrim(coalesce(p_values ->> 'en', '')), ''),
    nullif(btrim(coalesce(p_values ->> 'cs', '')), ''),
    nullif(btrim(coalesce(p_values ->> 'ru', '')), ''),
    nullif(btrim(coalesce(p_values ->> 'uk', '')), ''),
    nullif(btrim(coalesce(p_values ->> 'pl', '')), ''),
    nullif(btrim(coalesce(p_values ->> 'sk', '')), ''),
    btrim(coalesce(p_fallback, ''))
  );
$$;

-- Preserve current function evolution while removing only the old Olomouc-only runtime guards.
do $city_patch$
declare
  v_signature regprocedure;
  v_definition text;
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
    if v_signature is null then
      raise exception 'GROOMING018 city patch missing required function: %', v_name;
    end if;
    select pg_get_functiondef(v_signature) into v_definition;
    v_definition := replace(
      v_definition,
      'p_requested_city_id = ''olomouc''',
      'p_requested_city_id in (''olomouc'', ''prerov'')'
    );
    v_definition := replace(
      v_definition,
      'profile.city_id = ''olomouc''',
      'profile.city_id in (''olomouc'', ''prerov'')'
    );
    if position('prerov' in lower(v_definition)) = 0 then
      raise exception 'GROOMING018 city patch marker not found in required function: %', v_name;
    end if;
    execute v_definition;
  end loop;
end
$city_patch$;


commit;
