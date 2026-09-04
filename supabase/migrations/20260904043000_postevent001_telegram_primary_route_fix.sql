-- POSTEVENT001: prefer an executable Telegram route for post-event interaction prompts.
-- In-app remains the bounded fallback/action surface. All unrelated notification
-- kinds keep the existing explicit primary_route_id routing contract.

begin;

create or replace function public.go_irl_claim_event_notifications(
  p_providers text[],
  p_limit integer default 50,
  p_lease_seconds integer default 300
)
returns table (
  id uuid,
  user_key text,
  activity_id uuid,
  kind text,
  payload jsonb,
  attempt_count smallint,
  provider text,
  provider_user_id text,
  recipient_last_inbound_at timestamptz,
  language_code text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 200 then
    raise exception 'invalid_claim_limit';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'invalid_lease_seconds';
  end if;
  if p_providers is null
     or cardinality(p_providers) = 0
     or (p_providers <@ array['telegram','whatsapp','instagram','messenger']::text[]) is not true then
    raise exception 'invalid_providers';
  end if;

  -- POSTEVENT001 is a kind-level channel policy: Telegram is the primary
  -- interaction UX when an executable Telegram route exists. The in-app route
  -- is the fallback even when the user's generic primary route is different.
  update public.event_notifications notification
  set status = 'sent',
      sent_at = now(),
      provider = null,
      routing_outcome = 'in_app',
      selected_route_id = in_app_route.id,
      resolved_at = now(),
      last_error_code = null,
      updated_at = now()
  from public.communication_routes in_app_route
  where notification.user_key = in_app_route.user_key
    and notification.kind in (
      'post_event.organizer_confirmation',
      'post_event.participant_confirmation'
    )
    and notification.status in ('scheduled','failed')
    and coalesce(notification.next_attempt_at, notification.created_at) <= now()
    and in_app_route.channel = 'in_app'
    and in_app_route.readiness = 'ready'
    and in_app_route.consent_state = 'granted'
    and in_app_route.health_state in ('unknown','healthy')
    and in_app_route.capabilities @> array['outbound','notification']::text[]
    and not (
      'telegram' = any(p_providers)
      and exists (
        select 1
        from public.communication_routes telegram_route
        join public.user_provider_identities identity
          on identity.id = telegram_route.provider_identity_id
         and identity.user_key = notification.user_key
         and identity.provider = 'telegram'
         and identity.status = 'active'
        where telegram_route.user_key = notification.user_key
          and telegram_route.channel = 'telegram'
          and telegram_route.readiness = 'ready'
          and telegram_route.consent_state = 'granted'
          and telegram_route.health_state in ('unknown','healthy')
          and telegram_route.capabilities @> array['outbound','notification']::text[]
      )
    );

  -- Preserve the existing generic in-app primary-route behavior for every
  -- notification kind outside the two POSTEVENT001 interaction prompts.
  update public.event_notifications notification
  set status = 'sent',
      sent_at = now(),
      routing_outcome = 'in_app',
      selected_route_id = route.id,
      resolved_at = now(),
      updated_at = now()
  from public.communication_preferences preference
  join public.communication_routes route
    on route.id = preference.primary_route_id
  where notification.user_key = preference.user_key
    and notification.kind not in (
      'post_event.organizer_confirmation',
      'post_event.participant_confirmation'
    )
    and notification.status = 'scheduled'
    and coalesce(notification.next_attempt_at, notification.created_at) <= now()
    and preference.state = 'configured'
    and route.channel = 'in_app'
    and route.readiness = 'ready'
    and route.consent_state = 'granted'
    and route.capabilities @> array['outbound','notification']::text[];

  -- POSTEVENT rows that have neither an executable Telegram route nor an
  -- executable in-app fallback remain visible as routing attention, rather
  -- than being silently consumed by an unrelated generic primary route.
  update public.event_notifications notification
  set routing_outcome = 'needs_attention',
      last_error_code = 'postevent_route_unavailable',
      resolved_at = now(),
      updated_at = now()
  where notification.kind in (
      'post_event.organizer_confirmation',
      'post_event.participant_confirmation'
    )
    and notification.status = 'scheduled'
    and coalesce(notification.next_attempt_at, notification.created_at) <= now()
    and not (
      'telegram' = any(p_providers)
      and exists (
        select 1
        from public.communication_routes telegram_route
        join public.user_provider_identities identity
          on identity.id = telegram_route.provider_identity_id
         and identity.user_key = notification.user_key
         and identity.provider = 'telegram'
         and identity.status = 'active'
        where telegram_route.user_key = notification.user_key
          and telegram_route.channel = 'telegram'
          and telegram_route.readiness = 'ready'
          and telegram_route.consent_state = 'granted'
          and telegram_route.health_state in ('unknown','healthy')
          and telegram_route.capabilities @> array['outbound','notification']::text[]
      )
    )
    and not exists (
      select 1
      from public.communication_routes in_app_route
      where in_app_route.user_key = notification.user_key
        and in_app_route.channel = 'in_app'
        and in_app_route.readiness = 'ready'
        and in_app_route.consent_state = 'granted'
        and in_app_route.health_state in ('unknown','healthy')
        and in_app_route.capabilities @> array['outbound','notification']::text[]
    );

  -- Preserve generic route-resolution diagnostics for unrelated notifications.
  update public.event_notifications notification
  set routing_outcome = (
        select resolution.outcome
        from public.go_irl_resolve_communication_route(
          notification.user_key,
          notification.communication_kind
        ) resolution
      ),
      last_error_code = (
        select left(coalesce(resolution.reason, resolution.outcome), 80)
        from public.go_irl_resolve_communication_route(
          notification.user_key,
          notification.communication_kind
        ) resolution
      ),
      resolved_at = now(),
      updated_at = now()
  where notification.kind not in (
      'post_event.organizer_confirmation',
      'post_event.participant_confirmation'
    )
    and notification.status = 'scheduled'
    and coalesce(notification.next_attempt_at, notification.created_at) <= now()
    and (
      select resolution.outcome
      from public.go_irl_resolve_communication_route(
        notification.user_key,
        notification.communication_kind
      ) resolution
    ) <> 'executable';

  return query
  with due as (
    -- POSTEVENT001: select Telegram directly from the verified executable
    -- communication route instead of consuming the generic primary route.
    select notification.id,
           telegram_route.id as route_id,
           telegram_route.channel as provider,
           identity.provider_user_id,
           identity.last_inbound_at,
           app_user.language_code
    from public.event_notifications notification
    join public.communication_routes telegram_route
      on telegram_route.user_key = notification.user_key
     and telegram_route.channel = 'telegram'
    join public.user_provider_identities identity
      on identity.id = telegram_route.provider_identity_id
     and identity.user_key = notification.user_key
     and identity.provider = 'telegram'
     and identity.status = 'active'
    left join public.app_users app_user
      on app_user.user_key = notification.user_key
    where notification.kind in (
        'post_event.organizer_confirmation',
        'post_event.participant_confirmation'
      )
      and 'telegram' = any(p_providers)
      and telegram_route.readiness = 'ready'
      and telegram_route.consent_state = 'granted'
      and telegram_route.health_state in ('unknown','healthy')
      and telegram_route.capabilities @> array['outbound','notification']::text[]
      and (
        (notification.status = 'scheduled'
          and coalesce(notification.next_attempt_at, notification.created_at) <= now())
        or (notification.status = 'failed'
          and notification.next_attempt_at is not null
          and notification.next_attempt_at <= now())
        or (notification.status = 'sending'
          and notification.leased_at <= now() - make_interval(secs => p_lease_seconds))
      )

    union all

    -- All unrelated notification kinds retain the existing generic explicit
    -- primary-route selection contract exactly.
    select notification.id,
           route.id as route_id,
           route.channel as provider,
           identity.provider_user_id,
           identity.last_inbound_at,
           app_user.language_code
    from public.event_notifications notification
    join public.communication_preferences preference
      on preference.user_key = notification.user_key
     and preference.state = 'configured'
    join public.communication_routes route
      on route.id = preference.primary_route_id
     and route.user_key = notification.user_key
    join public.user_provider_identities identity
      on identity.id = route.provider_identity_id
     and identity.user_key = notification.user_key
     and identity.status = 'active'
    left join public.app_users app_user
      on app_user.user_key = notification.user_key
    where notification.kind not in (
        'post_event.organizer_confirmation',
        'post_event.participant_confirmation'
      )
      and route.channel = any(p_providers)
      and route.readiness = 'ready'
      and route.consent_state = 'granted'
      and route.health_state in ('unknown','healthy')
      and route.capabilities @> array['outbound','notification']::text[]
      and (
        (notification.status = 'scheduled'
          and coalesce(notification.next_attempt_at, notification.created_at) <= now())
        or (notification.status = 'failed'
          and notification.next_attempt_at is not null
          and notification.next_attempt_at <= now())
        or (notification.status = 'sending'
          and notification.leased_at <= now() - make_interval(secs => p_lease_seconds))
      )
  ), locked_due as (
    select notification.id,
           due.route_id,
           due.provider,
           due.provider_user_id,
           due.last_inbound_at,
           due.language_code
    from public.event_notifications notification
    join due on due.id = notification.id
    order by coalesce(notification.next_attempt_at, notification.created_at), notification.id
    for update of notification skip locked
    limit p_limit
  ), claimed as (
    update public.event_notifications notification
    set status = 'sending',
        attempt_count = notification.attempt_count + 1,
        leased_at = now(),
        provider = locked_due.provider,
        selected_route_id = locked_due.route_id,
        routing_outcome = 'executable',
        resolved_at = now(),
        last_error_code = null,
        updated_at = now()
    from locked_due
    where notification.id = locked_due.id
    returning notification.*
  )
  select claimed.id,
         claimed.user_key,
         claimed.activity_id,
         claimed.kind,
         claimed.payload,
         claimed.attempt_count,
         locked_due.provider,
         locked_due.provider_user_id,
         locked_due.last_inbound_at,
         locked_due.language_code
  from claimed
  join locked_due on locked_due.id = claimed.id;
end;
$$;

revoke all on function public.go_irl_claim_event_notifications(text[],integer,integer)
  from public, anon, authenticated;
grant execute on function public.go_irl_claim_event_notifications(text[],integer,integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
