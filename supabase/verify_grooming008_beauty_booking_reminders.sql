-- GROOMING008 structural verification for Beauty booking reminders.
-- Read-only: raises on missing canonical wiring or unsafe parallel structures.

do $$
declare
  v_constraint text;
  v_function text;
begin
  select pg_get_constraintdef(oid) into v_constraint
  from pg_constraint
  where conrelid = 'public.event_notifications'::regclass
    and conname = 'event_notifications_kind_check';

  if v_constraint is null
    or position('services.booking_reminder_24h' in v_constraint) = 0
    or position('services.booking_reminder_3h' in v_constraint) = 0 then
    raise exception 'GROOMING008 reminder kinds missing from canonical event_notifications constraint';
  end if;

  select pg_get_functiondef('public.go_irl_sync_beauty_booking_reminders()'::regprocedure)
  into v_function;

  if position("interval '24 hours'" in v_function) = 0
    or position("interval '3 hours'" in v_function) = 0
    or position('next_attempt_at' in v_function) = 0
    or position('delivery_key' in v_function) = 0
    or position("status = 'cancelled'" in v_function) = 0 then
    raise exception 'GROOMING008 reminder scheduler structure incomplete';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.beauty_booking_events'::regclass
      and tgname = 'go_irl_sync_beauty_booking_reminders'
      and not tgisinternal
  ) then
    raise exception 'GROOMING008 reminder trigger missing';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in ('beauty_booking_reminders', 'booking_reminders')
  ) then
    raise exception 'GROOMING008 must reuse event_notifications; parallel reminder table detected';
  end if;
end;
$$;

select kind, status, count(*) as rows
from public.event_notifications
where kind in ('services.booking_reminder_24h', 'services.booking_reminder_3h')
group by kind, status
order by kind, status;
