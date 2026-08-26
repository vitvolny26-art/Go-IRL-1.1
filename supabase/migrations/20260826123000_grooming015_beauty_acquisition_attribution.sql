-- GROOMING015: Beauty acquisition attribution handoff into canonical booking events.
-- Repository migration only. Production apply requires separate explicit approval.

begin;

alter table public.beauty_booking_events
  drop constraint if exists beauty_booking_events_type_check;

alter table public.beauty_booking_events
  add constraint beauty_booking_events_type_check
  check (event_type in (
    'booking_created',
    'status_changed',
    'booking_cancelled',
    'booking_expired',
    'notification_enqueued',
    'visit_professional_detail_recorded',
    'visit_client_feedback_submitted',
    'booking_acquisition_attributed'
  ));

create or replace function public.go_irl_create_beauty_booking_v2(
  p_profile_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_client_name text,
  p_client_contact text,
  p_idempotency_key text,
  p_source text default null,
  p_medium text default null,
  p_campaign text default null,
  p_ref text default null
)
returns table (
  result text,
  booking_id uuid,
  booking_status text,
  starts_at timestamptz,
  service_ends_at timestamptz,
  reserved_until timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source text := nullif(lower(btrim(coalesce(p_source, ''))), '');
  v_medium text := nullif(lower(btrim(coalesce(p_medium, ''))), '');
  v_campaign text := nullif(btrim(coalesce(p_campaign, '')), '');
  v_ref text := nullif(btrim(coalesce(p_ref, '')), '');
  v_result record;
begin
  if v_source is not null and v_source not in ('telegram','whatsapp','messenger','instagram','facebook','native','copy') then
    raise exception 'invalid Beauty acquisition source' using errcode = '22023';
  end if;
  if v_medium is not null and v_medium not in ('message','share','post','story','reel','copy') then
    raise exception 'invalid Beauty acquisition medium' using errcode = '22023';
  end if;
  if v_campaign is not null and (char_length(v_campaign) > 64 or v_campaign !~ '^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$') then
    raise exception 'invalid Beauty acquisition campaign' using errcode = '22023';
  end if;
  if v_ref is not null and (char_length(v_ref) > 96 or v_ref !~ '^[A-Za-z0-9_-]+$') then
    raise exception 'invalid Beauty acquisition ref' using errcode = '22023';
  end if;

  select * into v_result
  from public.go_irl_create_beauty_booking(
    p_profile_id,
    p_service_id,
    p_starts_at,
    p_client_name,
    p_client_contact,
    p_idempotency_key
  );

  if v_result.result = 'created'
    and (v_source is not null or v_medium is not null or v_campaign is not null or v_ref is not null) then
    insert into public.beauty_booking_events (
      booking_id,
      event_type,
      actor_user_key,
      from_status,
      to_status,
      payload,
      deduplication_key
    ) values (
      v_result.booking_id,
      'booking_acquisition_attributed',
      public.go_irl_auth_user_key(),
      v_result.booking_status,
      v_result.booking_status,
      jsonb_strip_nulls(jsonb_build_object(
        'source', v_source,
        'medium', v_medium,
        'campaign', v_campaign,
        'ref', v_ref
      )),
      'beauty-booking:' || v_result.booking_id::text || ':acquisition'
    ) on conflict (deduplication_key) do nothing;
  end if;

  return query select
    v_result.result::text,
    v_result.booking_id::uuid,
    v_result.booking_status::text,
    v_result.starts_at::timestamptz,
    v_result.service_ends_at::timestamptz,
    v_result.reserved_until::timestamptz,
    v_result.updated_at::timestamptz;
end;
$$;

revoke all on function public.go_irl_create_beauty_booking_v2(uuid,uuid,timestamptz,text,text,text,text,text,text,text) from public;
grant execute on function public.go_irl_create_beauty_booking_v2(uuid,uuid,timestamptz,text,text,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';

commit;
