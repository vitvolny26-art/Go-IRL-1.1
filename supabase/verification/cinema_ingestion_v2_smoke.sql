-- Cinema ingestion v2 smoke checks.
-- Safe to run against TEST: every data mutation is wrapped in a rollback.

-- 1) Structural contract.
do $$
declare
  missing text[];
begin
  select array_agg(x.name order by x.name)
    into missing
    from (values
      ('cinema_sources'),
      ('cinema_source_snapshots'),
      ('cinema_parse_runs'),
      ('cinema_screening_staging'),
      ('cinema_ingestion_jobs'),
      ('cinema_events'),
      ('cinema_publish_jobs')
    ) as x(name)
   where to_regclass('public.' || x.name) is null;

  if missing is not null then
    raise exception 'cinema ingestion v2 missing tables: %', missing;
  end if;

  if to_regprocedure('public.cinema_resolve_or_create_movie(text,text,text,text,text,integer,integer,text)') is null then
    raise exception 'cinema resolver RPC missing';
  end if;
  if to_regprocedure('public.cinema_enqueue_due_sources(timestamp with time zone,integer)') is null then
    raise exception 'cinema enqueue RPC missing';
  end if;
  if to_regprocedure('public.cinema_claim_ingestion_jobs(text,integer,text[])') is null then
    raise exception 'cinema claim RPC missing';
  end if;
  if to_regprocedure('public.cinema_finish_ingestion_job(uuid,boolean,jsonb,text,integer)') is null then
    raise exception 'cinema finish-job RPC missing';
  end if;
  if to_regprocedure('public.cinema_apply_parse_run(uuid)') is null then
    raise exception 'cinema atomic apply RPC missing';
  end if;
end $$;

-- 2) Control-plane tables must be service-role only by default: RLS on, no policies.
do $$
declare
  bad text[];
  policy_count integer;
begin
  select array_agg(c.relname order by c.relname)
    into bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any(array[
       'cinema_sources','cinema_source_snapshots','cinema_parse_runs',
       'cinema_screening_staging','cinema_ingestion_jobs','cinema_events','cinema_publish_jobs'
     ])
     and not c.relrowsecurity;

  if bad is not null then
    raise exception 'RLS disabled on control-plane tables: %', bad;
  end if;

  select count(*) into policy_count
    from pg_policies
   where schemaname = 'public'
     and tablename = any(array[
       'cinema_sources','cinema_source_snapshots','cinema_parse_runs',
       'cinema_screening_staging','cinema_ingestion_jobs','cinema_events','cinema_publish_jobs'
     ]);

  if policy_count <> 0 then
    raise exception 'Unexpected public/auth policies on cinema control plane: %', policy_count;
  end if;
end $$;

-- 3) Mutating control-plane RPCs must be service-role only.
do $$
declare
  sig text;
  signatures text[] := array[
    'public.cinema_resolve_or_create_movie(text,text,text,text,text,integer,integer,text)',
    'public.cinema_enqueue_due_sources(timestamp with time zone,integer)',
    'public.cinema_enqueue_due_sources_v2(timestamp with time zone,integer)',
    'public.cinema_claim_ingestion_jobs(text,integer,text[])',
    'public.cinema_finish_ingestion_job(uuid,boolean,jsonb,text,integer)',
    'public.cinema_apply_parse_run(uuid)'
  ];
begin
  foreach sig in array signatures loop
    if has_function_privilege('anon', sig, 'EXECUTE')
       or has_function_privilege('authenticated', sig, 'EXECUTE') then
      raise exception 'client role can execute cinema control RPC: %', sig;
    end if;
    if not has_function_privilege('service_role', sig, 'EXECUTE') then
      raise exception 'service_role cannot execute cinema control RPC: %', sig;
    end if;
  end loop;
end $$;

-- 4) Resolver idempotency. Nothing survives the rollback.
begin;

do $$
declare
  first_id uuid;
  second_id uuid;
begin
  first_id := public.cinema_resolve_or_create_movie(
    'cinema_smoke_source',
    'movie-smoke-001',
    'Cinema Smoke Movie',
    'cinema_smoke_source:cinema-smoke-movie:2099',
    'Cinema Smoke Movie',
    2099,
    90,
    'https://example.invalid/movie-smoke-001'
  );

  second_id := public.cinema_resolve_or_create_movie(
    'cinema_smoke_source',
    'movie-smoke-001',
    'Cinema Smoke Movie',
    'cinema_smoke_source:cinema-smoke-movie:2099',
    'Cinema Smoke Movie',
    2099,
    90,
    'https://example.invalid/movie-smoke-001'
  );

  if first_id is null or second_id is distinct from first_id then
    raise exception 'resolver is not idempotent: first %, second %', first_id, second_id;
  end if;
end $$;

rollback;

-- 5) Queue dedupe smoke using an existing TEST source. Nothing survives rollback.
begin;

do $$
declare
  sid uuid;
  smoke_now timestamptz := timestamptz '2099-01-02 08:00:00+00';
  first_count integer;
  second_count integer;
begin
  select id into sid
    from public.cinema_sources
   where enabled = true
   order by created_at
   limit 1
   for update;

  if sid is null then
    raise exception 'no enabled cinema source available for queue smoke';
  end if;

  update public.cinema_sources set next_fetch_at = smoke_now where id = sid;

  select count(*) into first_count
    from public.cinema_enqueue_due_sources(smoke_now, 1)
   where source_config_id = sid;

  update public.cinema_sources set next_fetch_at = smoke_now where id = sid;

  select count(*) into second_count
    from public.cinema_enqueue_due_sources(smoke_now, 1)
   where source_config_id = sid;

  if first_count <> 1 or second_count <> 0 then
    raise exception 'queue dedupe failed: first %, second %', first_count, second_count;
  end if;
end $$;

rollback;

select 'cinema_ingestion_v2_smoke_ok' as result;
