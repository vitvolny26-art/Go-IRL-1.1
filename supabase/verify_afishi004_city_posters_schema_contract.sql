-- AFISHI004 repository verifier.
-- Intended for an approved non-production verification environment or an approved production verification step.
-- The script is metadata/read-only and always rolls back its transaction.

begin;

do $verify$
declare
  v_table text;
  v_policy_count integer;
  v_function_proconfig text[];
begin
  foreach v_table in array array[
    'city_posters_venues',
    'city_posters_events',
    'city_posters_event_translations',
    'city_posters_occurrences',
    'city_posters_sources',
    'city_posters_source_records',
    'city_posters_offers'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'AFISHI004 missing table: %', v_table;
    end if;

    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relrowsecurity = true
    ) then
      raise exception 'AFISHI004 RLS disabled: %', v_table;
    end if;

    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
      or has_table_privilege('anon', 'public.' || v_table, 'INSERT')
      or has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
      or has_table_privilege('anon', 'public.' || v_table, 'DELETE') then
      raise exception 'AFISHI004 anon privilege leak: %', v_table;
    end if;

    if has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') then
      raise exception 'AFISHI004 authenticated direct mutation privilege leak: %', v_table;
    end if;

    if not has_table_privilege('service_role', 'public.' || v_table, 'SELECT')
      or not has_table_privilege('service_role', 'public.' || v_table, 'INSERT')
      or not has_table_privilege('service_role', 'public.' || v_table, 'UPDATE')
      or not has_table_privilege('service_role', 'public.' || v_table, 'DELETE') then
      raise exception 'AFISHI004 service_role privileges incomplete: %', v_table;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='city_posters_event_translations'
      and column_name='language'
  ) then
    raise exception 'AFISHI004 language column missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.city_posters_event_translations'::regclass
      and pg_get_constraintdef(oid) like '%ru%uk%cs%en%pl%sk%'
  ) then
    raise exception 'AFISHI004 six-language translation constraint missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='city_posters_occurrences'
      and column_name='starts_at' and data_type='timestamp with time zone'
  ) then
    raise exception 'AFISHI004 occurrences.starts_at must be timestamptz';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='city_posters_occurrences'
      and column_name='timezone' and is_nullable='NO'
  ) then
    raise exception 'AFISHI004 explicit occurrence timezone missing';
  end if;

  if to_regprocedure('private.city_posters_event_is_published(uuid)') is null then
    raise exception 'AFISHI004 published-event RLS helper missing';
  end if;
  if to_regprocedure('private.city_posters_offer_event_id(uuid,uuid)') is null then
    raise exception 'AFISHI004 offer-event RLS helper missing';
  end if;

  select p.proconfig into v_function_proconfig
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='city_posters_event_is_published';
  if v_function_proconfig is null
    or position('search_path=' in array_to_string(v_function_proconfig, ',')) = 0 then
    raise exception 'AFISHI004 published-event helper must pin search_path';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname='public'
    and tablename like 'city_posters_%';
  if v_policy_count <> 7 then
    raise exception 'AFISHI004 expected 7 read policies, found %', v_policy_count;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='city_posters_events'
      and policyname='city posters events catalog read'
      and cmd='SELECT'
      and 'authenticated'=any(roles)
      and coalesce(qual,'') like '%published%'
      and coalesce(qual,'') like '%go_irl_request_can_moderate%'
  ) then
    raise exception 'AFISHI004 event catalog RLS contract missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='city_posters_source_records'
      and policyname='city posters source records staff read'
      and coalesce(qual,'') like '%go_irl_request_can_moderate%'
  ) then
    raise exception 'AFISHI004 provenance staff-only RLS missing';
  end if;

  if to_regclass('public.activities') is null then
    raise exception 'AFISHI004 baseline activities table unexpectedly missing';
  end if;
  if to_regclass('public.cinema_movies') is null
    or to_regclass('public.cinema_screenings') is null
    or to_regclass('public.cinema_venues') is null then
    raise exception 'AFISHI004 cinema baseline unexpectedly missing';
  end if;
end
$verify$;

rollback;
