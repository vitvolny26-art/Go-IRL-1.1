-- GROOMING015 structural verification. Read-only.

select
  to_regprocedure('public.go_irl_create_beauty_booking_v2(uuid,uuid,timestamptz,text,text,text,text,text,text,text)') is not null
    as booking_v2_exists;

select pg_get_constraintdef(oid) as event_type_constraint
from pg_constraint
where conname = 'beauty_booking_events_type_check'
  and conrelid = 'public.beauty_booking_events'::regclass;

select
  count(*) filter (where event_type = 'booking_acquisition_attributed') as attributed_booking_events,
  count(*) filter (where event_type = 'visit_professional_detail_recorded') as professional_visit_events,
  count(*) filter (where event_type = 'visit_client_feedback_submitted') as client_visit_events
from public.beauty_booking_events;

select
  event_type,
  payload ->> 'source' as source,
  payload ->> 'medium' as medium,
  payload ->> 'campaign' as campaign,
  payload ->> 'ref' as ref,
  created_at
from public.beauty_booking_events
where event_type = 'booking_acquisition_attributed'
order by created_at desc
limit 20;
