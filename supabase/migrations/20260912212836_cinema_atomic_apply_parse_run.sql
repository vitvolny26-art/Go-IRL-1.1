create or replace function public.cinema_apply_parse_run(p_parse_run_id uuid)
returns uuid
language plpgsql
as $function$
declare
  v_parse public.cinema_parse_runs%rowtype;
  v_source public.cinema_sources%rowtype;
  v_row public.cinema_screening_staging%rowtype;
  v_payload jsonb;
  v_sync_run_id uuid;
  v_screening_id uuid;
  v_expected_count integer;
  v_ready_count integer;
  v_parser_key text;
begin
  select * into v_parse
  from public.cinema_parse_runs
  where id = p_parse_run_id
  for update;

  if not found then
    raise exception 'cinema parse run not found: %', p_parse_run_id;
  end if;

  if v_parse.status <> 'success'
     or not v_parse.fetch_complete
     or not v_parse.parser_complete
     or not v_parse.scope_complete
     or v_parse.fatal_error
     or v_parse.zero_result then
    raise exception 'cinema parse run is not safe to apply: %', p_parse_run_id;
  end if;

  select * into v_source
  from public.cinema_sources
  where id = v_parse.source_config_id
    and enabled = true
  for update;

  if not found then
    raise exception 'cinema source is missing or disabled for parse run: %', p_parse_run_id;
  end if;

  select count(*) into v_expected_count
  from public.cinema_screening_staging
  where parse_run_id = p_parse_run_id;

  select count(*) into v_ready_count
  from public.cinema_screening_staging
  where parse_run_id = p_parse_run_id
    and safe_to_write = true
    and movie_id is not null
    and starts_at_local is not null
    and (external_screening_id is not null or screening_fingerprint is not null)
    and jsonb_typeof(normalized_payload) = 'object'
    and nullif(normalized_payload->>'starts_at', '') is not null;

  if v_expected_count = 0
     or v_expected_count <> v_parse.records_valid
     or v_ready_count <> v_expected_count then
    raise exception 'cinema parse run staging is not fully resolved: parse %, expected %, ready %, records_valid %',
      p_parse_run_id, v_expected_count, v_ready_count, v_parse.records_valid;
  end if;

  v_parser_key := coalesce(nullif(v_source.config->>'parser_key', ''), v_source.adapter_key);
  v_sync_run_id := public.cinema_start_sync_run(
    v_source.venue_id,
    v_source.source_id,
    v_parser_key,
    v_source.parser_version
  );

  for v_row in
    select *
    from public.cinema_screening_staging
    where parse_run_id = p_parse_run_id
    order by row_no
    for update
  loop
    v_payload := v_row.normalized_payload;

    v_screening_id := public.cinema_upsert_screening(
      v_sync_run_id,
      v_source.venue_id,
      v_row.movie_id,
      v_source.source_id,
      (v_payload->>'starts_at')::timestamptz,
      nullif(v_payload->>'ends_at', '')::timestamptz,
      nullif(v_payload->>'audio_language', ''),
      coalesce(v_payload->'subtitle_languages', '[]'::jsonb),
      nullif(v_payload->>'audio_type', ''),
      nullif(v_payload->>'version_type', ''),
      nullif(v_payload->>'format', ''),
      coalesce(v_payload->'screening_tags', '[]'::jsonb),
      nullif(v_payload->>'ticket_url', ''),
      nullif(v_payload->>'source_url', ''),
      v_row.external_screening_id,
      v_row.screening_fingerprint,
      nullif(v_payload->>'auditorium', ''),
      nullif(v_payload->>'price_from', '')::numeric,
      nullif(v_payload->>'price_to', '')::numeric,
      nullif(v_payload->>'currency', '')
    );

    update public.cinema_screening_staging
    set screening_id = v_screening_id,
        sync_status = 'written',
        updated_at = now()
    where id = v_row.id;
  end loop;

  perform public.cinema_finish_sync_run(
    v_sync_run_id,
    'success',
    true,
    v_expected_count,
    v_parse.max_schedule_date,
    200,
    null
  );

  update public.cinema_sources
  set last_success_at = now(),
      consecutive_failures = 0
  where id = v_source.id;

  update public.cinema_venues
  set last_fetched_at = now(),
      last_fetch_status = 'success',
      schedule_known_until = v_parse.max_schedule_date,
      updated_at = now()
  where id = v_source.venue_id;

  insert into public.cinema_events(
    event_type, entity_type, entity_id, venue_id, city_id, sync_run_id, payload, dedupe_key
  )
  select
    'CINEMA_SYNC_COMPLETE',
    'sync_run',
    v_sync_run_id,
    v_source.venue_id,
    v.city_id,
    v_sync_run_id,
    jsonb_build_object(
      'source_id', v_source.source_id,
      'parse_run_id', p_parse_run_id,
      'records_seen', v_expected_count,
      'schedule_known_until', v_parse.max_schedule_date
    ),
    'cinema-sync:' || v_sync_run_id::text
  from public.cinema_venues v
  where v.id = v_source.venue_id
  on conflict (dedupe_key) do nothing;

  return v_sync_run_id;
end;
$function$;

comment on function public.cinema_apply_parse_run(uuid)
is 'Atomically applies one fully complete/resolved cinema parse run to canonical screenings. It never reconciles or deactivates missing screenings.';
