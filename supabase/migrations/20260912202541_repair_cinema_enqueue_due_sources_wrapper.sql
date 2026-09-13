create or replace function public.cinema_enqueue_due_sources(p_now timestamptz default now(), p_limit integer default 50)
returns table(job_id uuid, source_config_id uuid, venue_id uuid, source_id text)
language sql
as $$
  select q.id, q.source_config_id, s.venue_id, s.source_id
  from public.cinema_enqueue_due_sources_v2(p_now,p_limit) q
  join public.cinema_sources s on s.id=q.source_config_id;
$$;
