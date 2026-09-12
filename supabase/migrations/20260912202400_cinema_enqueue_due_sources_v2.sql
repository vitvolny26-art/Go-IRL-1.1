create or replace function public.cinema_enqueue_due_sources_v2(p_now timestamptz default now(), p_limit integer default 50)
returns setof public.cinema_ingestion_jobs
language plpgsql
as $$
begin
  return query
  with due as (
    select s.id as scid, s.venue_id as vid, s.source_id as sid,
           'fetch:' || s.id::text || ':' || to_char((p_now at time zone s.timezone)::date, 'YYYY-MM-DD') as dk
    from public.cinema_sources s
    where s.enabled = true and s.next_fetch_at <= p_now
    order by s.next_fetch_at, s.id
    limit greatest(1, least(coalesce(p_limit,50),500))
    for update skip locked
  ), ins as (
    insert into public.cinema_ingestion_jobs(job_type, source_config_id, dedupe_key, payload)
    select 'FETCH', d.scid, d.dk, jsonb_build_object('venue_id',d.vid,'source_id',d.sid)
    from due d
    on conflict do nothing
    returning *
  ), bump as (
    update public.cinema_sources s
    set last_attempt_at=p_now,
        next_fetch_at=p_now + make_interval(mins => s.fetch_interval_minutes)
    from due d
    where s.id=d.scid
    returning s.id
  )
  select * from ins;
end;
$$;
