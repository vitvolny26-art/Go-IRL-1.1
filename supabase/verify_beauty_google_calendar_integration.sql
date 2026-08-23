-- Repository verification for Beauty Google Calendar integration.
-- Apply only in a disposable or separately approved Supabase environment after the matching migration.

begin;

do $$
declare
  v_rls_count integer;
begin
  if to_regclass('public.beauty_google_calendar_connections') is null then
    raise exception 'missing beauty_google_calendar_connections';
  end if;
  if to_regclass('public.beauty_google_calendar_events') is null then
    raise exception 'missing beauty_google_calendar_events';
  end if;

  select count(*)
  into v_rls_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('beauty_google_calendar_connections', 'beauty_google_calendar_events')
    and c.relrowsecurity = true;
  if v_rls_count <> 2 then
    raise exception 'Google Calendar RLS is not enabled on both tables';
  end if;

  if to_regrole('authenticated') is not null and (
    has_table_privilege('authenticated', 'public.beauty_google_calendar_connections', 'select')
    or has_table_privilege('authenticated', 'public.beauty_google_calendar_connections', 'insert')
    or has_table_privilege('authenticated', 'public.beauty_google_calendar_connections', 'update')
    or has_table_privilege('authenticated', 'public.beauty_google_calendar_connections', 'delete')
    or has_table_privilege('authenticated', 'public.beauty_google_calendar_events', 'select')
    or has_table_privilege('authenticated', 'public.beauty_google_calendar_events', 'insert')
    or has_table_privilege('authenticated', 'public.beauty_google_calendar_events', 'update')
    or has_table_privilege('authenticated', 'public.beauty_google_calendar_events', 'delete')
  ) then
    raise exception 'authenticated role must not have direct Google Calendar table privileges';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'beauty_google_calendar_connections_sync_mode_check'
      and conrelid = 'public.beauty_google_calendar_connections'::regclass
  ) then
    raise exception 'Google Calendar sync mode constraint missing';
  end if;
end;
$$;

rollback;
