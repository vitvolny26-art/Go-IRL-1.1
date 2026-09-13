create or replace function public.cinema_requeue_stale_ingestion_jobs(
  p_stale_after_minutes integer default 30
)
returns table(requeued integer, failed integer)
language plpgsql
as $function$
declare
  v_minutes integer := greatest(5, least(coalesce(p_stale_after_minutes, 30), 1440));
  v_requeued integer := 0;
  v_failed integer := 0;
begin
  with moved as (
    update public.cinema_ingestion_jobs j
       set status = 'queued',
           run_after = now() + interval '1 minute',
           locked_at = null,
           locked_by = null,
           error_message = case
             when nullif(j.error_message, '') is null then 'stale_worker_lease_recovered'
             else left(j.error_message || ' | stale_worker_lease_recovered', 4000)
           end
     where j.status = 'running'
       and j.locked_at is not null
       and j.locked_at < now() - make_interval(mins => v_minutes)
       and j.attempt < j.max_attempts
     returning 1
  )
  select count(*) into v_requeued from moved;

  with exhausted as (
    update public.cinema_ingestion_jobs j
       set status = 'failed',
           finished_at = now(),
           locked_at = null,
           locked_by = null,
           error_message = case
             when nullif(j.error_message, '') is null then 'stale_worker_lease_exhausted'
             else left(j.error_message || ' | stale_worker_lease_exhausted', 4000)
           end
     where j.status = 'running'
       and j.locked_at is not null
       and j.locked_at < now() - make_interval(mins => v_minutes)
       and j.attempt >= j.max_attempts
     returning 1
  )
  select count(*) into v_failed from exhausted;

  return query select v_requeued, v_failed;
end;
$function$;

revoke execute on function public.cinema_requeue_stale_ingestion_jobs(integer) from public, anon, authenticated;
grant execute on function public.cinema_requeue_stale_ingestion_jobs(integer) to service_role;

comment on function public.cinema_requeue_stale_ingestion_jobs(integer)
is 'Recovers stale running cinema ingestion jobs after a bounded worker lease. Retries jobs with attempts remaining and fails exhausted jobs.';
