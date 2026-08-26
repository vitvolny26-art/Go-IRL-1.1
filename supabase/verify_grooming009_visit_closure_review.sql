-- GROOMING009 structural verification (read-only).
select to_regclass('public.beauty_visit_feedback') as feedback_table;
select count(*) as professional_rpc_count from pg_proc where proname = 'go_irl_record_professional_visit_detail';
select count(*) as client_rpc_count from pg_proc where proname = 'go_irl_submit_client_visit_feedback';
select count(*) as visit_prompt_function_count from pg_proc where proname = 'go_irl_queue_beauty_visit_confirmation_24h';
select count(*) as visit_prompt_trigger_count from pg_trigger where tgname = 'beauty_booking_events_queue_visit_confirmation_24h' and not tgisinternal;
select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'public.event_notifications'::regclass and conname = 'event_notifications_kind_check';
select kind,status,count(*) as row_count from public.event_notifications where kind = 'services.booking_visit_confirmation_24h' group by kind,status order by status;
select booking_id,professional_detail,client_confirmation,rating,dispute_state,review_is_public,updated_at from public.beauty_visit_feedback order by updated_at desc limit 20;
