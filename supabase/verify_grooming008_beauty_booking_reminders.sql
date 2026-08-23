-- GROOMING008 canonical structural verification.
-- Run after applying the canonicalization migration.

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_trigger
  where tgname = 'go_irl_sync_beauty_booking_reminders'
    and not tgisinternal;
  if v_count <> 1 then
    raise exception 'expected one canonical reminder trigger, got %', v_count;
  end if;

  select count(*) into v_count
  from pg_trigger
  where tgname = 'beauty_booking_events_queue_reminders'
    and not tgisinternal;
  if v_count <> 0 then
    raise exception 'legacy reminder trigger still exists';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'go_irl_sync_beauty_booking_reminders';
  if v_count <> 1 then
    raise exception 'expected one canonical reminder function, got %', v_count;
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'go_irl_queue_beauty_booking_reminders';
  if v_count <> 0 then
    raise exception 'legacy reminder function still exists';
  end if;
end $$;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.event_notifications'::regclass
  and conname = 'event_notifications_kind_check';

select tablename
from pg_tables
where schemaname = 'public'
  and tablename ilike '%reminder%';

select kind, status, count(*)
from public.event_notifications
where kind in ('services.booking_reminder_24h', 'services.booking_reminder_3h')
group by kind, status
order by kind, status;
