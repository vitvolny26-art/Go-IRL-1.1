-- GROOMING008 structural verification for Beauty booking reminders.
-- Run after applying the migration in a disposable/test database.

do $$
declare
  v_trigger_count integer;
  v_function_count integer;
begin
  select count(*) into v_trigger_count
  from pg_trigger
  where tgname = 'beauty_booking_events_queue_reminders'
    and not tgisinternal;

  if v_trigger_count <> 1 then
    raise exception 'expected one beauty_booking_events_queue_reminders trigger, got %', v_trigger_count;
  end if;

  select count(*) into v_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'go_irl_queue_beauty_booking_reminders';

  if v_function_count <> 1 then
    raise exception 'expected one go_irl_queue_beauty_booking_reminders function, got %', v_function_count;
  end if;
end $$;

-- Reminder kinds must be accepted by the canonical outbox constraint.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.event_notifications'::regclass
  and conname = 'event_notifications_kind_check';

-- No GROOMING008-specific reminder queue/table should exist.
select tablename
from pg_tables
where schemaname = 'public'
  and tablename ilike '%reminder%';

-- Operational evidence query: due/sent/retry/cancelled state by reminder kind.
select kind, status, count(*)
from public.event_notifications
where kind in ('services.booking_reminder_24h', 'services.booking_reminder_3h')
group by kind, status
order by kind, status;
