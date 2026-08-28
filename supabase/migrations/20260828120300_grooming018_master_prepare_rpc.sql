-- GROOMING018: split from the approved local onboarding migration for connector-safe commit transport.
begin;

create or replace function public.go_irl_prepare_beauty_master_onboarding(
  p_request_id text,
  p_token_hash text,
  p_approved_payload jsonb,
  p_expires_at timestamptz
)
returns table(status text, onboarding_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_actor_role text;
  v_onboarding public.beauty_master_onboarding_claims%rowtype;
  v_item jsonb;
  v_active_count integer := 0;
  v_weekday_count integer;
  v_weekday_distinct_count integer;
  v_service_count integer;
  v_service_distinct_count integer;
  v_portfolio_count integer;
  v_portfolio_distinct_count integer;
  v_existing_payload jsonb;
  v_existing_claimed_at timestamptz;
  v_start time;
  v_end time;
  v_break_start time;
  v_break_end time;
  v_break_enabled boolean;
begin
  select role into v_actor_role from public.user_roles where user_key = v_actor;
  if v_actor is null or v_actor_role not in ('admin', 'superadmin') then
    raise exception 'admin or superadmin role required' using errcode = '42501';
  end if;

  if p_request_id is null
    or p_request_id !~ '^GROOMING018-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at is null
    or p_expires_at <= now()
    or p_expires_at > now() + interval '7 days'
    or p_approved_payload is null
    or jsonb_typeof(p_approved_payload) <> 'object'
    or p_approved_payload ->> 'version' <> '1'
    or p_approved_payload ->> 'sourceLanguage' not in ('ru','uk','cs','en','pl','sk')
    or p_approved_payload ->> 'profession' not in ('nails','barber')
    or p_approved_payload ->> 'cityId' not in ('olomouc','prerov') then
    raise exception 'invalid Beauty onboarding approval contract' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_approved_payload ->> 'displayName', ''))) not between 2 and 80
    or char_length(btrim(coalesce(p_approved_payload ->> 'publicLocation', ''))) not between 2 and 120
    or char_length(btrim(coalesce(p_approved_payload ->> 'contact', ''))) not between 3 and 160
    or char_length(btrim(coalesce(p_approved_payload ->> 'exactAddress', ''))) not between 5 and 200
    or char_length(btrim(coalesce(p_approved_payload ->> 'instagramUrl', ''))) > 300 then
    raise exception 'invalid Beauty onboarding profile fields' using errcode = '22023';
  end if;
  if coalesce(p_approved_payload ->> 'instagramUrl', '') <> ''
    and p_approved_payload ->> 'instagramUrl' !~ '^https://(www\.)?instagram\.com/' then
    raise exception 'invalid Beauty onboarding Instagram URL' using errcode = '22023';
  end if;

  if jsonb_typeof(p_approved_payload -> 'profile') <> 'object'
    or not public.go_irl_beauty_i18n_fits(p_approved_payload #> '{profile,descriptionByLanguage}', 1200)
    or not public.go_irl_beauty_i18n_fits(p_approved_payload #> '{profile,experienceByLanguage}', 700)
    or not public.go_irl_beauty_i18n_fits(p_approved_payload #> '{profile,specializationByLanguage}', 700)
    or not public.go_irl_beauty_i18n_fits(p_approved_payload #> '{profile,hygieneByLanguage}', 700)
    or not public.go_irl_beauty_i18n_fits(p_approved_payload #> '{profile,materialsByLanguage}', 700)
    or not public.go_irl_beauty_i18n_fits(p_approved_payload #> '{profile,spokenLanguagesByLanguage}', 400)
    or not public.go_irl_beauty_i18n_fits(p_approved_payload #> '{profile,certificatesByLanguage}', 700)
    or not public.go_irl_beauty_i18n_fits(p_approved_payload #> '{profile,bookingNotesByLanguage}', 700) then
    raise exception 'incomplete Beauty onboarding translations' using errcode = '22023';
  end if;

  if jsonb_typeof(p_approved_payload -> 'services') <> 'array'
    or jsonb_array_length(p_approved_payload -> 'services') not between 1 and 50 then
    raise exception 'invalid Beauty onboarding services' using errcode = '22023';
  end if;

  select count(*), count(distinct value ->> 'id')
  into v_service_count, v_service_distinct_count
  from jsonb_array_elements(p_approved_payload -> 'services');
  if v_service_count <> v_service_distinct_count then
    raise exception 'Beauty onboarding service ids must be unique' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_approved_payload -> 'services') loop
    if jsonb_typeof(v_item) <> 'object'
      or char_length(btrim(coalesce(v_item ->> 'id', ''))) not between 3 and 120
      or btrim(coalesce(v_item ->> 'id', '')) !~ '^[A-Za-z0-9._:-]+$'
      or coalesce(nullif(v_item ->> 'specialization', ''), p_approved_payload ->> 'profession') <> p_approved_payload ->> 'profession'
      or not public.go_irl_beauty_i18n_fits(v_item -> 'nameByLanguage', 120)
      or char_length(public.go_irl_beauty_i18n_pick(v_item -> 'nameByLanguage', 'en', '')) < 2
      or jsonb_typeof(v_item -> 'durationMinutes') <> 'number'
      or coalesce(v_item ->> 'durationMinutes', '') !~ '^[0-9]+$'
      or (v_item ->> 'durationMinutes')::integer not between 5 and 480
      or jsonb_typeof(v_item -> 'priceCzk') <> 'number'
      or coalesce(v_item ->> 'priceCzk', '') !~ '^[0-9]+$'
      or (v_item ->> 'priceCzk')::integer not between 0 and 100000
      or jsonb_typeof(v_item -> 'bufferMinutes') <> 'number'
      or coalesce(v_item ->> 'bufferMinutes', '') !~ '^[0-9]+$'
      or (v_item ->> 'bufferMinutes')::integer not between 0 and 240
      or (v_item ? 'active' and jsonb_typeof(v_item -> 'active') <> 'boolean') then
      raise exception 'invalid Beauty onboarding service item' using errcode = '22023';
    end if;
    if coalesce((v_item ->> 'active')::boolean, true) then v_active_count := v_active_count + 1; end if;
  end loop;
  if v_active_count = 0 then
    raise exception 'Beauty onboarding requires at least one active service' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_approved_payload -> 'portfolio', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_approved_payload -> 'portfolio', '[]'::jsonb)) > 24 then
    raise exception 'invalid Beauty onboarding portfolio' using errcode = '22023';
  end if;
  select count(*), count(distinct value ->> 'id')
  into v_portfolio_count, v_portfolio_distinct_count
  from jsonb_array_elements(coalesce(p_approved_payload -> 'portfolio', '[]'::jsonb));
  if v_portfolio_count <> v_portfolio_distinct_count then
    raise exception 'Beauty onboarding portfolio ids must be unique' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_approved_payload -> 'portfolio', '[]'::jsonb)) loop
    if jsonb_typeof(v_item) <> 'object'
      or char_length(btrim(coalesce(v_item ->> 'id', ''))) not between 3 and 120
      or btrim(coalesce(v_item ->> 'id', '')) !~ '^[A-Za-z0-9._:-]+$'
      or char_length(btrim(coalesce(v_item ->> 'imageUrl', ''))) not between 8 and 1200
      or btrim(coalesce(v_item ->> 'imageUrl', '')) !~ '^https://'
      or not public.go_irl_beauty_i18n_fits(v_item -> 'altByLanguage', 300) then
      raise exception 'invalid Beauty onboarding portfolio item' using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(p_approved_payload -> 'availability') <> 'object'
    or jsonb_typeof(p_approved_payload #> '{availability,weekdays}') <> 'array'
    or jsonb_array_length(p_approved_payload #> '{availability,weekdays}') not between 1 and 7
    or coalesce(p_approved_payload #>> '{availability,startTime}', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or coalesce(p_approved_payload #>> '{availability,endTime}', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or jsonb_typeof(p_approved_payload #> '{availability,breakEnabled}') <> 'boolean' then
    raise exception 'invalid Beauty onboarding availability' using errcode = '22023';
  end if;

  select count(*), count(distinct value)
  into v_weekday_count, v_weekday_distinct_count
  from jsonb_array_elements_text(p_approved_payload #> '{availability,weekdays}');
  if v_weekday_count <> v_weekday_distinct_count
    or exists (
      select 1 from jsonb_array_elements_text(p_approved_payload #> '{availability,weekdays}') day(value)
      where value not in ('mon','tue','wed','thu','fri','sat','sun')
    ) then
    raise exception 'invalid Beauty onboarding weekdays' using errcode = '22023';
  end if;

  v_start := (p_approved_payload #>> '{availability,startTime}')::time;
  v_end := (p_approved_payload #>> '{availability,endTime}')::time;
  if v_start >= v_end then
    raise exception 'invalid Beauty onboarding working hours' using errcode = '22023';
  end if;

  v_break_enabled := (p_approved_payload #>> '{availability,breakEnabled}')::boolean;
  if v_break_enabled then
    if coalesce(p_approved_payload #>> '{availability,breakStart}', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(p_approved_payload #>> '{availability,breakEnd}', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'invalid Beauty onboarding break' using errcode = '22023';
    end if;
    v_break_start := (p_approved_payload #>> '{availability,breakStart}')::time;
    v_break_end := (p_approved_payload #>> '{availability,breakEnd}')::time;
    if not (v_start < v_break_start and v_break_start < v_break_end and v_break_end < v_end) then
      raise exception 'invalid Beauty onboarding break bounds' using errcode = '22023';
    end if;
  end if;

  select approved_payload, claimed_at
  into v_existing_payload, v_existing_claimed_at
  from public.beauty_master_onboarding_claims
  where request_id = p_request_id
  for update;

  if found then
    if v_existing_claimed_at is not null then
      return query select 'already_claimed'::text, null::uuid, null::timestamptz;
      return;
    end if;
    if v_existing_payload is distinct from p_approved_payload then
      return query select 'approval_conflict'::text, null::uuid, null::timestamptz;
      return;
    end if;
  end if;

  insert into public.beauty_master_onboarding_claims (
    request_id, token_hash, approved_payload, prepared_by_user_key, prepared_at, expires_at, revoked_at
  ) values (
    p_request_id, p_token_hash, p_approved_payload, v_actor, now(), p_expires_at, null
  )
  on conflict (request_id) do update
  set token_hash = excluded.token_hash,
      prepared_by_user_key = excluded.prepared_by_user_key,
      prepared_at = now(),
      expires_at = excluded.expires_at,
      revoked_at = null
  where public.beauty_master_onboarding_claims.claimed_at is null
  returning * into v_onboarding;

  if v_onboarding.id is null then
    return query select 'already_claimed'::text, null::uuid, null::timestamptz;
    return;
  end if;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'beauty_master_onboarding.prepared',
    'beauty_master_onboarding',
    v_onboarding.id::text,
    jsonb_build_object('request_id', p_request_id, 'expires_at', v_onboarding.expires_at)
  );

  return query select 'prepared'::text, v_onboarding.id, v_onboarding.expires_at;
end;
$$;

revoke all on function public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz) from public, anon;
grant execute on function public.go_irl_prepare_beauty_master_onboarding(text,text,jsonb,timestamptz) to authenticated;


commit;
