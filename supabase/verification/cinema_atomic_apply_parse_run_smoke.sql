-- End-to-end transactional smoke for cinema_apply_parse_run.
-- TEST only. Every inserted row is rolled back.

begin;

do $$
declare
  v_source public.cinema_sources%rowtype;
  v_snapshot uuid;
  v_parse uuid;
  v_movie uuid;
  v_sync uuid;
  v_screening uuid;
  v_complete boolean;
begin
  select * into v_source
  from public.cinema_sources
  where enabled = true
  order by created_at
  limit 1;

  if v_source.id is null then
    raise exception 'smoke source missing';
  end if;

  v_movie := public.cinema_resolve_or_create_movie(
    v_source.source_id,
    'atomic-smoke-movie-2099',
    'Atomic Smoke Movie',
    v_source.source_id || ':atomic-smoke-movie:2099',
    'Atomic Smoke Movie',
    2099,
    90,
    'https://example.invalid/atomic-smoke-movie'
  );

  insert into public.cinema_source_snapshots(
    source_config_id, venue_id, source_id, source_url, fetch_status,
    raw_format, raw_payload, content_hash, parser_version
  ) values (
    v_source.id, v_source.venue_id, v_source.source_id, v_source.source_url, 'fetched',
    'json', '{}'::jsonb, 'sha256:atomic-smoke', v_source.parser_version
  ) returning id into v_snapshot;

  insert into public.cinema_parse_runs(
    snapshot_id, source_config_id, adapter_key, parser_version, status, completed_at,
    records_parsed, records_valid, records_rejected,
    min_schedule_date, max_schedule_date, expected_until,
    fetch_complete, parser_complete, scope_complete, fatal_error, zero_result
  ) values (
    v_snapshot, v_source.id, v_source.adapter_key, v_source.parser_version, 'success', now(),
    1, 1, 0,
    date '2099-01-02', date '2099-01-02', date '2099-01-02',
    true, true, true, false, false
  ) returning id into v_parse;

  insert into public.cinema_screening_staging(
    parse_run_id, source_config_id, row_no,
    external_screening_id, screening_fingerprint,
    external_movie_id, movie_fingerprint, title, release_year, duration_minutes,
    starts_at_local, timezone, normalized_payload,
    movie_id, safe_to_write, sync_status
  ) values (
    v_parse, v_source.id, 1,
    'atomic-smoke-screening-2099', 'sha256:atomic-smoke-screening-2099',
    'atomic-smoke-movie-2099', v_source.source_id || ':atomic-smoke-movie:2099',
    'Atomic Smoke Movie', 2099, 90,
    timestamp '2099-01-02 19:30:00', v_source.timezone,
    jsonb_build_object(
      'starts_at','2099-01-02T18:30:00.000Z',
      'audio_language','cs',
      'subtitle_languages','[]'::jsonb,
      'version_type','cz',
      'format','2D',
      'screening_tags','[]'::jsonb,
      'source_url','https://example.invalid/atomic-smoke-screening'
    ),
    v_movie, true, 'resolved'
  );

  v_sync := public.cinema_apply_parse_run(v_parse);

  select id into v_screening
  from public.cinema_screenings
  where source_id = v_source.source_id
    and external_screening_id = 'atomic-smoke-screening-2099';

  select is_complete into v_complete
  from public.cinema_sync_runs
  where id = v_sync;

  if v_sync is null or v_screening is null or v_complete is distinct from true then
    raise exception 'atomic apply smoke failed: sync %, screening %, complete %',
      v_sync, v_screening, v_complete;
  end if;
end $$;

rollback;

select 'cinema_atomic_apply_parse_run_smoke_ok' as result;
