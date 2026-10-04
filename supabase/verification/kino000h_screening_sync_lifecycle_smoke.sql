-- Kino000H TEST-only lifecycle smoke. Run manually against a non-production database.
-- All fixture mutations are rolled back.
begin;

do $$
declare
  v_apply_function text;
begin
  select pg_get_functiondef('public.cinema_apply_parse_run(uuid)'::regprocedure)
    into v_apply_function;

  if position('s.cinema_id = v_source.venue_id' in v_apply_function) = 0 then
    raise exception 'Kino000H missing venue isolation';
  end if;
  if position('s.source_id = v_source.source_id' in v_apply_function) = 0 then
    raise exception 'Kino000H missing source isolation';
  end if;
  if position('between v_parse.min_schedule_date and v_parse.max_schedule_date' in v_apply_function) = 0 then
    raise exception 'Kino000H missing authoritative-window bound';
  end if;
  if position('s.last_seen_sync_run_id is distinct from v_sync_run_id' in v_apply_function) = 0 then
    raise exception 'Kino000H missing seen-row exclusion';
  end if;
  if position('v_parse.zero_result' in v_apply_function) = 0 then
    raise exception 'Kino000H zero-result fail-closed guard missing';
  end if;
end $$;

-- Schema/audit contract.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='cinema_sync_runs' and column_name='parse_run_id'
  ) then raise exception 'Kino000H parse_run_id audit column missing'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='cinema_sync_runs' and column_name='records_removed'
  ) then raise exception 'Kino000H records_removed audit column missing'; end if;
end $$;

rollback;
