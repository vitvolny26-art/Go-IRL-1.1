-- CineStar second-source idempotency smoke.
-- TEST only. All mutations are rolled back.

begin;

do $$
declare
  v_source public.cinema_sources%rowtype;
  v_snapshot uuid;
  v_parse uuid;
  v_movie_first uuid;
  v_movie_second uuid;
  v_sync_first uuid;
  v_sync_second uuid;
  v_screening_first uuid;
  v_screening_second uuid;
  v_run_first uuid;
  v_run_second uuid;
  v_screening_count integer;
  v_mapping_count integer;
  v_run_count integer;
begin
  select s.* into v_source
  from public.cinema_sources s
  join public.cinema_venues v on v.id = s.venue_id
  where s.source_id = 'cinestar_cz'
    and v.slug = 'olomouc-cinestar'
  for update of s;

  if v_source.id is null then
    raise exception 'cinestar smoke source missing';
  end if;

  -- cinema_apply_parse_run requires an enabled source. This is rolled back.
  update public.cinema_sources set enabled = true where id = v_source.id;

  v_movie_first := public.cinema_resolve_or_create_movie(
    'cinestar_cz', '999990', 'Idempotency Smoke Movie',
    'cinestar_cz:999990:2099', 'Idempotency Smoke Movie', 2099, 101,
    'https://cinestar.cz/cz/olomouc/filmy/movie/999990-idempotency-smoke'
  );
  v_movie_second := public.cinema_resolve_or_create_movie(
    'cinestar_cz', '999990', 'Idempotency Smoke Movie',
    'cinestar_cz:999990:2099', 'Idempotency Smoke Movie', 2099, 101,
    'https://cinestar.cz/cz/olomouc/filmy/movie/999990-idempotency-smoke'
  );

  if v_movie_first is null or v_movie_second is distinct from v_movie_first then
    raise exception 'movie resolver idempotency failed: first %, second %', v_movie_first, v_movie_second;
  end if;

  insert into public.cinema_source_snapshots(
    source_config_id, venue_id, source_id, source_url, fetch_status,
    raw_format, raw_payload, content_hash, parser_version
  ) values (
    v_source.id, v_source.venue_id, v_source.source_id, v_source.source_url, 'fetched',
    'json', '{}'::jsonb, 'sha256:cinestar-idempotency-smoke', v_source.parser_version
  ) returning id into v_snapshot;

  insert into public.cinema_parse_runs(
    snapshot_id, source_config_id, adapter_key, parser_version, status, completed_at,
    records_parsed, records_valid, records_rejected,
    min_schedule_date, max_schedule_date, expected_until,
    fetch_complete, parser_complete, scope_complete, fatal_error, zero_result
  ) values (
    v_snapshot, v_source.id, v_source.adapter_key, v_source.parser_version, 'success', now(),
    1, 1, 0, date '2099-01-02', date '2099-01-02', date '2099-01-02',
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
    '999990001', 'sha256:cinestar-idempotency-screening-999990001',
    '999990', 'cinestar_cz:999990:2099', 'Idempotency Smoke Movie', 2099, 101,
    timestamp '2099-01-02 19:30:00', 'Europe/Prague',
    jsonb_build_object(
      'starts_at','2099-01-02T18:30:00.000Z',
      'audio_language','cs',
      'subtitle_languages','[]'::jsonb,
      'audio_type','7.1',
      'version_type','dubbed',
      'format','2D',
      'auditorium','STANDARD',
      'screening_tags','["STANDARD","7.1"]'::jsonb,
      'ticket_url','https://example.invalid/cinestar-idempotency-ticket',
      'source_url','https://cinestar.cz/cz/olomouc/filmy/movie/999990-idempotency-smoke'
    ),
    v_movie_first, true, 'resolved'
  );

  v_sync_first := public.cinema_apply_parse_run(v_parse);
  select screening_id into v_screening_first
  from public.cinema_screening_staging where parse_run_id = v_parse and row_no = 1;
  v_run_first := public.cinema_rebuild_run(v_movie_first, v_source.venue_id);

  v_sync_second := public.cinema_apply_parse_run(v_parse);
  select screening_id into v_screening_second
  from public.cinema_screening_staging where parse_run_id = v_parse and row_no = 1;
  v_run_second := public.cinema_rebuild_run(v_movie_first, v_source.venue_id);

  select count(*) into v_screening_count
  from public.cinema_screenings
  where source_id = 'cinestar_cz' and external_screening_id = '999990001';

  select count(*) into v_mapping_count
  from public.cinema_movie_sources
  where source_id = 'cinestar_cz' and external_movie_id = '999990';

  select count(*) into v_run_count
  from public.cinema_runs
  where movie_id = v_movie_first and cinema_id = v_source.venue_id;

  if v_sync_first is null or v_sync_second is null then
    raise exception 'sync run missing: first %, second %', v_sync_first, v_sync_second;
  end if;
  if v_screening_first is null or v_screening_second is distinct from v_screening_first then
    raise exception 'screening idempotency failed: first %, second %', v_screening_first, v_screening_second;
  end if;
  if v_screening_count <> 1 then raise exception 'screening duplicated: count %', v_screening_count; end if;
  if v_mapping_count <> 1 then raise exception 'movie source mapping duplicated: count %', v_mapping_count; end if;
  if v_run_first is null or v_run_second is distinct from v_run_first or v_run_count <> 1 then
    raise exception 'cinema run idempotency failed: first %, second %, count %', v_run_first, v_run_second, v_run_count;
  end if;
end $$;

rollback;

select 'cinestar_second_source_idempotency_smoke_ok' as result;
