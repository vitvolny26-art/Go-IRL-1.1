do $$
declare
  v_sync text;
  v_submit text;
begin
  select pg_get_functiondef('go_irl_private.postevent_sync_notifications(uuid)'::regprocedure) into v_sync;
  select pg_get_functiondef('public.go_irl_submit_activity_attendance_confirmation(uuid,text)'::regprocedure) into v_submit;

  if v_sync like '%participant_fallback_at%' then
    raise exception 'participant fallback scheduling bypass still present';
  end if;
  if v_sync not like '%postevent_waiting_for_organizer%' then
    raise exception 'organizer-first notification gate missing';
  end if;
  if v_submit like '%now() < v_outcome.participant_fallback_at%' then
    raise exception 'time-based participant RPC bypass still present';
  end if;
  if v_submit not like '%v_outcome.organizer_event_claim is null%' then
    raise exception 'organizer decision RPC gate missing';
  end if;
  if v_submit not like '%v_outcome.organizer_roster_finalized_at is null%' then
    raise exception 'organizer roster RPC gate missing';
  end if;
end $$;
