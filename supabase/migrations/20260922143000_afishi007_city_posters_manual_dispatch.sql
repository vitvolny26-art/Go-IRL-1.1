-- AFISHI007: bounded manual dispatcher for approved City Posters publication.
-- Repository migration only. DO NOT apply to production without separate explicit production migration approval.
begin;

create or replace function public.go_irl_dispatch_city_posters_publication(
  p_event_ids uuid[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requested_count integer;
  v_ready_count integer;
  v_active_publication_count integer;
  v_service_role_count integer;
  v_service_role_key text;
  v_request_id bigint;
begin
  if p_event_ids is null or cardinality(p_event_ids) = 0 then
    raise exception 'city_posters_event_ids_required';
  end if;

  select count(distinct event_id)
  into v_requested_count
  from unnest(p_event_ids) event_id;

  if v_requested_count <> cardinality(p_event_ids) then
    raise exception 'city_posters_event_ids_must_be_unique';
  end if;

  select count(*)
  into v_ready_count
  from public.city_posters_events event
  where event.id = any(p_event_ids)
    and event.status = 'published'
    and event.hero_media_url is not null
    and btrim(event.hero_media_url) <> '';

  if v_ready_count <> v_requested_count then
    raise exception 'city_posters_events_not_publishable';
  end if;

  select count(*)
  into v_active_publication_count
  from public.city_posters_telegram_publications publication
  where publication.event_id = any(p_event_ids)
    and publication.deleted_at is null;

  if v_active_publication_count <> 0 then
    raise exception 'city_posters_active_publication_exists';
  end if;

  select count(*), min(secret.decrypted_secret)
  into v_service_role_count, v_service_role_key
  from vault.decrypted_secrets secret
  where secret.name = 'service_role_key'
    and length(secret.decrypted_secret) >= 32;

  if v_service_role_count <> 1 or v_service_role_key is null then
    raise exception 'service_role_key_missing_or_ambiguous';
  end if;

  select net.http_post(
    url := 'https://tygfsvjkznypilfyyvdc.supabase.co/functions/v1/telegramEventSupergroup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key,
      'apikey', v_service_role_key
    ),
    body := jsonb_build_object(
      'action', 'maintain_city_poster_publications',
      'limit', least(v_requested_count, 200)
    ),
    timeout_milliseconds := 10000
  )
  into v_request_id;

  if v_request_id is null then
    raise exception 'city_posters_publication_dispatch_request_not_created';
  end if;

  return v_request_id;
end;
$function$;

revoke all on function public.go_irl_dispatch_city_posters_publication(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.go_irl_dispatch_city_posters_publication(uuid[])
  to service_role;

comment on function public.go_irl_dispatch_city_posters_publication(uuid[]) is
  'AFISHI007 bounded manual dispatcher. Requires an explicit unique set of already-published events with hero media and no active Telegram publication; keeps the service-role credential inside Vault and invokes the existing City Posters maintenance action directly.';

notify pgrst, 'reload schema';

commit;
