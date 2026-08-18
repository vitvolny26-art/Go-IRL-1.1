-- MASTER004: enforce booking lifecycle completion timing at the trusted RPC boundary.
-- Repository migration only. Production apply requires a separate explicit approval.

create or replace function public.go_irl_transition_beauty_booking(
  p_booking_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_target_status text
)
returns table (
  result text,
  booking_id uuid,
  booking_status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_booking public.beauty_bookings%rowtype;
  v_actor text := public.go_irl_auth_user_key();
  v_allowed boolean := false;
  v_event_type text := 'status_changed';
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.beauty_bookings booking
  where booking.id = p_booking_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if not public.go_irl_owns_beauty_profile(v_booking.profile_id) then
    raise exception 'current professional profile ownership required' using errcode = '42501';
  end if;

  if p_expected_status is distinct from v_booking.status
    or p_expected_updated_at is distinct from v_booking.updated_at then
    return query select 'stale'::text, v_booking.id, v_booking.status, v_booking.updated_at;
    return;
  end if;

  v_allowed :=
    (v_booking.status = 'pending' and p_target_status in ('confirmed', 'declined'))
    or (v_booking.status = 'confirmed' and p_target_status in ('cancelled', 'completed', 'no_show'));

  if not v_allowed then
    return query select 'invalid_transition'::text, v_booking.id, v_booking.status, v_booking.updated_at;
    return;
  end if;

  if p_target_status in ('completed', 'no_show')
    and now() < v_booking.service_ends_at then
    return query select 'invalid_transition'::text, v_booking.id, v_booking.status, v_booking.updated_at;
    return;
  end if;

  if p_target_status = 'cancelled' then
    v_event_type := 'booking_cancelled';
  end if;

  update public.beauty_bookings booking
  set
    status = p_target_status,
    confirmed_at = case when p_target_status = 'confirmed' then now() else booking.confirmed_at end,
    cancelled_at = case when p_target_status = 'cancelled' then now() else booking.cancelled_at end,
    completed_at = case when p_target_status = 'completed' then now() else booking.completed_at end
  where booking.id = v_booking.id
  returning * into v_booking;

  insert into public.beauty_booking_events (
    booking_id,
    event_type,
    actor_user_key,
    from_status,
    to_status,
    payload,
    deduplication_key
  )
  values (
    v_booking.id,
    v_event_type,
    v_actor,
    p_expected_status,
    p_target_status,
    jsonb_build_object('source', 'professional_rpc'),
    'beauty-booking:' || v_booking.id::text || ':' || p_expected_status || ':' || p_target_status || ':' || extract(epoch from p_expected_updated_at)::bigint::text
  );

  return query select 'changed'::text, v_booking.id, v_booking.status, v_booking.updated_at;
end;
$$;

revoke all on function public.go_irl_transition_beauty_booking(uuid, text, timestamptz, text) from public;
revoke execute on function public.go_irl_transition_beauty_booking(uuid, text, timestamptz, text) from anon;
grant execute on function public.go_irl_transition_beauty_booking(uuid, text, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
