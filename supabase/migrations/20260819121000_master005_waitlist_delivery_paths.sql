-- MASTER005 P2: keep waitlist release notifications deliverable for web-auth users.
-- Every release remains visible in-app through the waitlist server state; when a linked
-- messaging identity exists, the canonical outbox may additionally select that provider.
-- Repository presence does not apply this migration to production.

begin;

create or replace function public.go_irl_notify_available_beauty_waitlist_entries(
  p_profile_id uuid,
  p_released_start timestamptz,
  p_released_until timestamptz,
  p_source_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_local_date date;
  v_delivery_key text;
  v_inserted integer;
  v_has_external_delivery boolean;
  v_notified integer := 0;
begin
  if p_profile_id is null
    or p_released_start is null
    or p_released_until is null
    or p_released_start >= p_released_until
    or nullif(btrim(coalesce(p_source_key, '')), '') is null then
    return 0;
  end if;

  for v_entry in
    select
      entry.id,
      entry.profile_id,
      entry.service_id,
      entry.client_user_key,
      entry.slot_start,
      entry.duration_minutes_snapshot,
      entry.buffer_minutes_snapshot,
      service.service_name,
      service.service_name_i18n,
      profile.public_location
    from public.beauty_booking_waitlist_entries entry
    join public.beauty_professional_profiles profile
      on profile.id = entry.profile_id
    join public.beauty_professional_services service
      on service.id = entry.service_id
      and service.profile_id = entry.profile_id
    where entry.profile_id = p_profile_id
      and entry.status = 'active'
      and entry.slot_start > now()
      and tstzrange(
        entry.slot_start,
        entry.slot_start + make_interval(
          mins => entry.duration_minutes_snapshot + entry.buffer_minutes_snapshot
        ),
        '[)'
      ) && tstzrange(p_released_start, p_released_until, '[)')
    order by entry.created_at, entry.id
  loop
    v_local_date := (v_entry.slot_start at time zone 'Europe/Prague')::date;

    if not exists (
      select 1
      from public.go_irl_list_public_beauty_availability(
        v_entry.profile_id,
        v_entry.service_id,
        v_local_date,
        v_local_date
      ) available
      where available.slot_start = v_entry.slot_start
    ) then
      continue;
    end if;

    select exists (
      select 1
      from public.user_provider_identities identity
      where identity.user_key = v_entry.client_user_key
        and identity.status = 'active'
        and identity.provider in ('telegram', 'whatsapp', 'instagram', 'messenger')
    ) into v_has_external_delivery;

    v_delivery_key := 'beauty-waitlist:' || v_entry.id::text || ':' || md5(p_source_key);

    insert into public.event_notifications (
      user_key,
      activity_id,
      kind,
      payload,
      status,
      sent_at,
      provider,
      delivery_key
    ) values (
      v_entry.client_user_key,
      null,
      'services.waitlist_slot_available',
      jsonb_build_object(
        'subjectType', 'beauty_booking',
        'waitlistId', v_entry.id,
        'profileId', v_entry.profile_id,
        'serviceId', v_entry.service_id,
        'title', case
          when jsonb_typeof(v_entry.service_name_i18n) = 'object' then v_entry.service_name_i18n
          else jsonb_build_object('en', v_entry.service_name)
        end,
        'date', to_char(v_entry.slot_start at time zone 'Europe/Prague', 'YYYY-MM-DD'),
        'time', to_char(v_entry.slot_start at time zone 'Europe/Prague', 'HH24:MI:SS'),
        'address', v_entry.public_location,
        'reservationGuaranteed', false,
        'source', 'beauty_waitlist',
        'deliveryMode', case
          when v_has_external_delivery then 'in_app_plus_provider'
          else 'in_app_only'
        end,
        'openPath', '/services'
      ),
      case when v_has_external_delivery then 'scheduled' else 'sent' end,
      case when v_has_external_delivery then null else now() end,
      null,
      v_delivery_key
    )
    on conflict (delivery_key) do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted = 1 then
      update public.beauty_booking_waitlist_entries entry
      set
        notification_count = entry.notification_count + 1,
        last_notified_at = now()
      where entry.id = v_entry.id
        and entry.status = 'active';

      v_notified := v_notified + 1;
    end if;
  end loop;

  return v_notified;
end;
$$;

revoke execute on function public.go_irl_notify_available_beauty_waitlist_entries(uuid, timestamptz, timestamptz, text)
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
