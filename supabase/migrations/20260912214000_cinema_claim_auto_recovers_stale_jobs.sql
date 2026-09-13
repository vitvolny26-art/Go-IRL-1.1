create or replace function public.cinema_claim_ingestion_jobs(
  p_worker text,
  p_limit integer default 10,
  p_job_types text[] default null
)
returns setof public.cinema_ingestion_jobs
language plpgsql
as $function$
begin
  perform public.cinema_requeue_stale_ingestion_jobs(30);

  return query
  with c as (
    select j.id
    from public.cinema_ingestion_jobs j
    where j.status = 'queued'
      and j.run_after <= now()
      and (p_job_types is null or j.job_type = any(p_job_types))
    order by j.priority asc, j.created_at asc
    limit greatest(1, least(coalesce(p_limit,10), 100))
    for update skip locked
  )
  update public.cinema_ingestion_jobs j
     set status='running',
         locked_at=now(),
         locked_by=p_worker,
         started_at=coalesce(j.started_at, now()),
         attempt=j.attempt+1
    from c
   where j.id=c.id
  returning j.*;
end;
$function$;

revoke execute on function public.cinema_claim_ingestion_jobs(text,integer,text[]) from public, anon, authenticated;
grant execute on function public.cinema_claim_ingestion_jobs(text,integer,text[]) to service_role;

comment on function public.cinema_claim_ingestion_jobs(text,integer,text[])
is 'Claims queued cinema ingestion jobs with SKIP LOCKED and first recovers running jobs whose 30-minute worker lease went stale.';
