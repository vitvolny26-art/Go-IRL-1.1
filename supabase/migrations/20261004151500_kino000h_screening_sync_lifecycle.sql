-- Kino000H: authoritative screening sync/lifecycle reconciliation.
-- Repo migration only until explicitly applied to PROD.

alter table public.cinema_sync_runs
  add column if not exists parse_run_id uuid references public.cinema_parse_runs(id) on delete set null,
  add column if not exists schedule_known_from date,
  add column if not exists records_inserted integer not null default 0,
  add column if not exists records_updated integer not null default 0,
  add column if not exists records_reactivated integer not null default 0,
  add column if not exists records_removed integer not null default 0;

create unique index if not exists cinema_sync_runs_parse_run_uidx
  on public.cinema_sync_runs(parse_run_id)
  where parse_run_id is not null;

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
  v_existing_sync_run_id uuid;
  v_screening_id uuid;
  v_existing_screening_id uuid;
  v_existing_status text;
  v_expected_count integer;
  v_ready_count integer;
  v_parser_key text;
  v_inserted_count integer := 0;
  v_updated_count integer := 0;
  v_reactivated_count integer := 0;
  v_removed_count integer := 0;
begin
  select * into v_parse
  from public.cinema_parse_runs
  where id = p_parse_run_id
  for update;

  if not found then
    raise exception 'cinema parse run not found: %', p_parse_run_id;
  end if;

  -- A lifecycle-authoritative sync is allowed only for a fully complete parse.
  if v_parse.status <> 'success'
     or not v_parse.fetch_complete
     or not v_parse.parser_complete
     or not v_parse.scope_complete
     or v_parse.fatal_error
     or v_parse.zero_result then
    raise exception 'cinema parse run is not safe to apply: %', p_parse_run_id;
  end if;

  if v_parse.min_schedule_date is null
     or v_parse.max_schedule_date is null
     or v_parse.min_schedule_date > v_parse.max_schedule_date then
    raise exception 'cinema parse run authoritative window is invalid: %', p_parse_run_id;
  end if;

  -- Applying the same parse run again is a no-op: return the original successful sync.
  select id into v_existing_sync_run_id
  from public.cinema_sync_runs
  where parse_run_id = p_parse_run_id
    and status = 'success'
    and is_complete = true
  order by completed_at desc nulls last, created_at desc
  limit 1;

  if v_existing_sync_run_id is not null then
    return v_existing_sync_run_id;
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

  update public.cinema_sync_runs
  set parse_run_id = p_parse_run_id,
      schedule_known_from = v_parse.min_schedule_date
  where id = v_sync_run_id;

  for v_row in
    select *
    from public.cinema_screening_staging
    where parse_run_id = p_parse_run_id
    order by row_no
    for update
  loop
    v_payload := v_row.normalized_payload;
    v_existing_screening_id := null;
    v_existing_status := null;

    if v_row.external_screening_id is not null then
      select id, status
        into v_existing_screening_id, v_existing_status
      from public.cinema_screenings
      where cinema_id = v_source.venue_id
        and source_id = v_source.source_id
        and external_screening_id = v_row.external_screening_id
      limit 1
      for update;
    elsif v_row.screening_fingerprint is not null then
      select id, status
        into v_existing_screening_id, v_existing_status
      from public.cinema_screenings
      where cinema_id = v_source.venue_id
        and source_id = v_source.source_id
        and screening_fingerprint = v_row.screening_fingerprint
      limit 1
      for update;
    end if;

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

    if v_existing_screening_id is null then
      v_inserted_count := v_inserted_count + 1;
    elsif v_existing_status = 'removed' then
      v_reactivated_count := v_reactivated_count + 1;
    else
      v_updated_count := v_updated_count + 1;
    end if;

    update public.cinema_screening_staging
    set screening_id = v_screening_id,
        sync_status = 'written',
        updated_at = now()
    where id = v_row.id;
  end loop;

  -- Reconcile only the authoritative source+venue+date window. Rows seen in this
  -- sync carry v_sync_run_id, so anything else still schedulable in the same
  -- bounded window is absent from the complete source snapshot and becomes removed.
  update public.cinema_screenings s
  set status = 'removed',
      updated_at = now()
  where s.cinema_id = v_source.venue_id
    and s.source_id = v_source.source_id
    and s.status in ('scheduled', 'sold_out', 'active')
    and (s.starts_at at time zone v_source.timezone)::date
      between v_parse.min_schedule_date and v_parse.max_schedule_date
    and s.last_seen_sync_run_id is distinct from v_sync_run_id;

  get diagnostics v_removed_count = row_count;

  perform public.cinema_finish_sync_run(
    v_sync_run_id,
    'success',
    true,
    v_expected_count,
    v_parse.max_schedule_date,
    200,
    null
  );

  update public.cinema_sync_runs
  set schedule_known_from = v_parse.min_schedule_date,
      records_inserted = v_inserted_count,
      records_updated = v_updated_count,
      records_reactivated = v_reactivated_count,
      records_removed = v_removed_count
  where id = v_sync_run_id;

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
      'records_inserted', v_inserted_count,
      'records_updated', v_updated_count,
      'records_reactivated', v_reactivated_count,
      'records_removed', v_removed_count,
      'schedule_known_from', v_parse.min_schedule_date,
      'schedule_known_until', v_parse.max_schedule_date
    ),
    'cinema-sync:' || v_sync_run_id::text
  from public.cinema_venues v
  where v.id = v_source.venue_id
  on conflict (dedupe_key) do nothing;

  return v_sync_run_id;
end;
$function$;

revoke execute on function public.cinema_apply_parse_run(uuid)
  from public, anon, authenticated;
grant execute on function public.cinema_apply_parse_run(uuid)
  to service_role;

comment on function public.cinema_apply_parse_run(uuid)
is 'Kino000H: atomically applies one fully complete parse run, reactivates seen screenings, and marks missing schedulable screenings removed only inside the authoritative source+venue+date window. Same parse_run_id is idempotent.';
