-- ACT080-005B structural verification. Intended for a database where the migration
-- has already been applied. This script is rollback-only and makes no durable change.

begin;

do $verify$
declare
  v_policy text;
begin
  if to_regclass('public.activity_series') is null then
    raise exception 'activity_series table missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'series_id'
  ) then
    raise exception 'activities.series_id missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'series_occurrence_no'
  ) then
    raise exception 'activities.series_occurrence_no missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'series_occurrence_status'
  ) then
    raise exception 'activities.series_occurrence_status missing';
  end if;

  if to_regprocedure('public.go_irl_create_weekly_activity_series(text,text,text,text,date,time without time zone,text,text,text,text,text,jsonb,integer,integer,text,text,text,date,smallint)') is null then
    raise exception 'weekly series RPC missing';
  end if;

  select qual
  into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'activity_series'
    and policyname = 'activity series owner read';

  if v_policy is null or position('organizer_key' in v_policy) = 0 or position('go_irl_auth_user_key' in v_policy) = 0 then
    raise exception 'activity_series owner RLS missing or unsafe';
  end if;

  if has_table_privilege('authenticated', 'public.activity_series', 'INSERT')
    or has_table_privilege('authenticated', 'public.activity_series', 'UPDATE')
    or has_table_privilege('authenticated', 'public.activity_series', 'DELETE') then
    raise exception 'authenticated has direct activity_series mutation privilege';
  end if;
end
$verify$;

rollback;
