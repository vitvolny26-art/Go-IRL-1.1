revoke execute on function public.cinema_resolve_or_create_movie(text,text,text,text,text,integer,integer,text) from public, anon, authenticated;
grant execute on function public.cinema_resolve_or_create_movie(text,text,text,text,text,integer,integer,text) to service_role;

revoke execute on function public.cinema_enqueue_due_sources(timestamptz,integer) from public, anon, authenticated;
grant execute on function public.cinema_enqueue_due_sources(timestamptz,integer) to service_role;

revoke execute on function public.cinema_enqueue_due_sources_v2(timestamptz,integer) from public, anon, authenticated;
grant execute on function public.cinema_enqueue_due_sources_v2(timestamptz,integer) to service_role;

revoke execute on function public.cinema_claim_ingestion_jobs(text,integer,text[]) from public, anon, authenticated;
grant execute on function public.cinema_claim_ingestion_jobs(text,integer,text[]) to service_role;

revoke execute on function public.cinema_finish_ingestion_job(uuid,boolean,jsonb,text,integer) from public, anon, authenticated;
grant execute on function public.cinema_finish_ingestion_job(uuid,boolean,jsonb,text,integer) to service_role;

revoke execute on function public.cinema_apply_parse_run(uuid) from public, anon, authenticated;
grant execute on function public.cinema_apply_parse_run(uuid) to service_role;
