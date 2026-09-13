-- POSTEVENT001 D1 notification scheduling verifier.
-- Run only after the foundation and scheduling migrations are present in the target DB.

do $$
declare
  v_kind_def text;
  v_trigger_count integer;
  v_function_count integer;
begin
  select pg_get_constraintdef(oid)
  into v_kind_def
  from pg_constraint
  where conrelid = 'public.event_notifications'::regclass
    and conname = 'event_notifications_kind_check';

  if v_kind_def is null
     or position('post_event.organizer_confirmation' in v_kind_def) = 0
     or position('post_event.participant_confirmation' in v_kind_def) = 0 then
    raise exception 'POSTEVENT001 notification kinds missing';
  end if;

  select count(*) into v_function_count
  from pg_proc
  where pronamespace = 'go_irl_private'::regnamespace
    and proname in (
      'postevent_sync_notifications',
      'postevent_sync_outcome_notifications_trigger',
      'postevent_sync_feedback_notifications_trigger'
    );

  if v_function_count <> 3 then
    raise exception 'POSTEVENT001 notification functions missing: %', v_function_count;
  end if;

  select count(*) into v_trigger_count
  from pg_trigger
  where not tgisinternal
    and tgname in (
      'postevent001_sync_outcome_notifications',
      'postevent001_sync_feedback_notifications'
    );

  if v_trigger_count <> 2 then
    raise exception 'POSTEVENT001 notification triggers missing: %', v_trigger_count;
  end if;

  if exists (
    select 1
    from pg_proc
    where pronamespace = 'go_irl_private'::regnamespace
      and proname = 'postevent_sync_notifications'
      and pg_get_functiondef(oid) like '%provider, delivery_key%telegram%'
  ) then
    raise exception 'POSTEVENT001 scheduling must not hardcode Telegram provider';
  end if;
end $$;

select count(*) as postevent_scheduled_or_terminal_rows
from public.event_notifications
where kind in ('post_event.organizer_confirmation','post_event.participant_confirmation');

select count(*) as duplicate_delivery_keys
from (
  select delivery_key
  from public.event_notifications
  where delivery_key like 'postevent:%'
  group by delivery_key
  having count(*) > 1
) duplicate_keys;
