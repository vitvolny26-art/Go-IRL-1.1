-- TEST-only stale worker lease recovery smoke. All rows roll back.
begin;

do $$
declare
  sid uuid;
  retry_id uuid;
  exhausted_id uuid;
  retry_status text;
  exhausted_status text;
  r record;
begin
  select id into sid
  from public.cinema_sources
  where enabled = true
  order by created_at
  limit 1;

  if sid is null then raise exception 'no source for stale job smoke'; end if;

  insert into public.cinema_ingestion_jobs(
    job_type, source_config_id, status, attempt, max_attempts,
    locked_at, locked_by, dedupe_key
  ) values (
    'FETCH', sid, 'running', 1, 5,
    now() - interval '2 hours', 'smoke-worker', 'stale-retry-smoke:' || gen_random_uuid()
  ) returning id into retry_id;

  insert into public.cinema_ingestion_jobs(
    job_type, source_config_id, status, attempt, max_attempts,
    locked_at, locked_by, dedupe_key
  ) values (
    'FETCH', sid, 'running', 5, 5,
    now() - interval '2 hours', 'smoke-worker', 'stale-exhaust-smoke:' || gen_random_uuid()
  ) returning id into exhausted_id;

  select * into r from public.cinema_requeue_stale_ingestion_jobs(30);

  if r.requeued <> 1 or r.failed <> 1 then
    raise exception 'unexpected stale recovery counts: %, %', r.requeued, r.failed;
  end if;

  select status into retry_status from public.cinema_ingestion_jobs where id = retry_id;
  select status into exhausted_status from public.cinema_ingestion_jobs where id = exhausted_id;

  if retry_status <> 'queued' or exhausted_status <> 'failed' then
    raise exception 'unexpected stale statuses: retry %, exhausted %', retry_status, exhausted_status;
  end if;
end $$;

rollback;

select 'cinema_stale_job_recovery_smoke_ok' as result;
