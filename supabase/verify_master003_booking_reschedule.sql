do $$
begin
  if to_regprocedure('public.go_irl_reschedule_beauty_booking(uuid,timestamptz,timestamptz)') is null then
    raise exception 'missing go_irl_reschedule_beauty_booking';
  end if;
  if has_function_privilege('anon', 'public.go_irl_reschedule_beauty_booking(uuid,timestamptz,timestamptz)', 'EXECUTE') then
    raise exception 'anon must not execute reschedule RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.go_irl_reschedule_beauty_booking(uuid,timestamptz,timestamptz)', 'EXECUTE') then
    raise exception 'authenticated must execute reschedule RPC';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.event_notifications'::regclass
      and conname = 'event_notifications_kind_check'
      and pg_get_constraintdef(oid) like '%services.booking_rescheduled%'
  ) then
    raise exception 'booking_rescheduled notification kind missing';
  end if;
end;
$$;
