begin;

create table if not exists public.cinema_publication_approval_sources (
  source_config_id uuid primary key references public.cinema_sources(id) on delete cascade,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cinema_publication_approvals (
  id uuid primary key default gen_random_uuid(),
  parse_run_id uuid not null unique references public.cinema_parse_runs(id) on delete cascade,
  source_config_id uuid not null references public.cinema_sources(id) on delete cascade,
  requested_user_key text references public.app_users(user_key) on delete set null,
  status text not null default 'pending' check (status in (
    'pending','sending','sent','applying','applied','rejected','failed','expired','superseded'
  )),
  approve_token_hash text unique,
  reject_token_hash text unique,
  telegram_message_id text,
  expires_at timestamptz,
  decided_at timestamptz,
  applied_at timestamptz,
  sync_run_id uuid references public.cinema_sync_runs(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cinema_publication_approvals_pending_idx
  on public.cinema_publication_approvals(status, created_at desc);

create index if not exists cinema_publication_approvals_source_idx
  on public.cinema_publication_approvals(source_config_id, created_at desc);

alter table public.cinema_publication_approval_sources enable row level security;
alter table public.cinema_publication_approvals enable row level security;

revoke all on table public.cinema_publication_approval_sources from public, anon, authenticated;
revoke all on table public.cinema_publication_approvals from public, anon, authenticated;
grant select, insert, update, delete on public.cinema_publication_approval_sources to service_role;
grant select, insert, update, delete on public.cinema_publication_approvals to service_role;

create or replace function public.cinema_request_publication_approval(p_parse_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_parse public.cinema_parse_runs%rowtype;
  v_approval_id uuid;
  v_expected integer;
  v_ready integer;
begin
  select * into v_parse
  from public.cinema_parse_runs
  where id = p_parse_run_id
  for update;

  if not found then
    raise exception 'cinema approval parse run not found';
  end if;

  if v_parse.status <> 'success'
     or not v_parse.fetch_complete
     or not v_parse.parser_complete
     or not v_parse.scope_complete
     or v_parse.fatal_error
     or v_parse.zero_result then
    raise exception 'cinema approval parse run not ready';
  end if;

  select count(*) into v_expected
  from public.cinema_screening_staging
  where parse_run_id = p_parse_run_id;

  select count(*) into v_ready
  from public.cinema_screening_staging
  where parse_run_id = p_parse_run_id
    and safe_to_write = true
    and movie_id is not null
    and starts_at_local is not null
    and (external_screening_id is not null or screening_fingerprint is not null)
    and jsonb_typeof(normalized_payload) = 'object'
    and nullif(normalized_payload->>'starts_at', '') is not null;

  if v_expected = 0
     or v_expected <> v_parse.records_valid
     or v_ready <> v_expected then
    raise exception 'cinema approval staging not fully resolved';
  end if;

  update public.cinema_publication_approvals
  set status = 'superseded',
      approve_token_hash = null,
      reject_token_hash = null,
      updated_at = now()
  where source_config_id = v_parse.source_config_id
    and parse_run_id <> p_parse_run_id
    and status in ('pending','sending','sent');

  insert into public.cinema_publication_approvals(parse_run_id, source_config_id)
  values (p_parse_run_id, v_parse.source_config_id)
  on conflict (parse_run_id) do nothing
  returning id into v_approval_id;

  if v_approval_id is null then
    select id into v_approval_id
    from public.cinema_publication_approvals
    where parse_run_id = p_parse_run_id;
  end if;

  return v_approval_id;
end;
$function$;

create or replace function public.cinema_gate_sync_job_for_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.job_type <> 'SYNC'
     or new.parse_run_id is null
     or new.source_config_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.cinema_publication_approval_sources gate
    where gate.source_config_id = new.source_config_id
      and gate.active = true
  ) then
    return new;
  end if;

  perform public.cinema_request_publication_approval(new.parse_run_id);
  return null;
end;
$function$;

drop trigger if exists kino007a_gate_sync_for_approval on public.cinema_ingestion_jobs;
create trigger kino007a_gate_sync_for_approval
before insert on public.cinema_ingestion_jobs
for each row execute function public.cinema_gate_sync_job_for_approval();

create or replace function public.cinema_claim_publication_decision(
  p_token_hash text,
  p_decision text
)
returns table(
  approval_id uuid,
  parse_run_id uuid,
  decision_state text,
  claimed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_row public.cinema_publication_approvals%rowtype;
  v_expected_hash text;
begin
  if p_decision not in ('approve','reject')
     or p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid cinema approval decision';
  end if;

  select * into v_row
  from public.cinema_publication_approvals
  where approve_token_hash = p_token_hash
     or reject_token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'cinema approval token not found';
  end if;

  if v_row.expires_at is not null
     and v_row.expires_at <= now()
     and v_row.status in ('sending','sent') then
    update public.cinema_publication_approvals
    set status = 'expired',
        approve_token_hash = null,
        reject_token_hash = null,
        decided_at = now(),
        updated_at = now()
    where id = v_row.id;
    return query select v_row.id, v_row.parse_run_id, 'expired'::text, false;
    return;
  end if;

  v_expected_hash := case when p_decision = 'approve'
    then v_row.approve_token_hash else v_row.reject_token_hash end;

  if v_expected_hash is distinct from p_token_hash then
    raise exception 'cinema approval token decision mismatch';
  end if;

  if v_row.status not in ('sending','sent') then
    return query select v_row.id, v_row.parse_run_id, v_row.status, false;
    return;
  end if;

  if p_decision = 'reject' then
    update public.cinema_publication_approvals
    set status = 'rejected',
        approve_token_hash = null,
        reject_token_hash = null,
        decided_at = now(),
        updated_at = now()
    where id = v_row.id;
    return query select v_row.id, v_row.parse_run_id, 'rejected'::text, true;
    return;
  end if;

  update public.cinema_publication_approvals
  set status = 'applying',
      approve_token_hash = null,
      reject_token_hash = null,
      decided_at = now(),
      updated_at = now()
  where id = v_row.id;

  return query select v_row.id, v_row.parse_run_id, 'applying'::text, true;
end;
$function$;

create or replace function public.cinema_finish_publication_approval(
  p_approval_id uuid,
  p_success boolean,
  p_sync_run_id uuid default null,
  p_error_message text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_status text;
begin
  update public.cinema_publication_approvals
  set status = case when p_success then 'applied' else 'failed' end,
      sync_run_id = case when p_success then p_sync_run_id else sync_run_id end,
      applied_at = case when p_success then now() else applied_at end,
      error_message = case when p_success then null else left(coalesce(p_error_message,'cinema_apply_failed'), 500) end,
      updated_at = now()
  where id = p_approval_id
    and status = 'applying'
  returning status into v_status;

  if v_status is null then
    select status into v_status
    from public.cinema_publication_approvals
    where id = p_approval_id;
  end if;

  return coalesce(v_status, 'missing');
end;
$function$;

revoke all on function public.cinema_request_publication_approval(uuid) from public, anon, authenticated;
revoke all on function public.cinema_gate_sync_job_for_approval() from public, anon, authenticated;
revoke all on function public.cinema_claim_publication_decision(text,text) from public, anon, authenticated;
revoke all on function public.cinema_finish_publication_approval(uuid,boolean,uuid,text) from public, anon, authenticated;

grant execute on function public.cinema_request_publication_approval(uuid) to service_role;
grant execute on function public.cinema_claim_publication_decision(text,text) to service_role;
grant execute on function public.cinema_finish_publication_approval(uuid,boolean,uuid,text) to service_role;

comment on table public.cinema_publication_approval_sources is
  'Kino007A activation gate. Empty by default; adding an active source is a separately approved production mutation.';
comment on table public.cinema_publication_approvals is
  'Kino007A one-time approval ledger for fully resolved cinema parse runs.';
comment on function public.cinema_gate_sync_job_for_approval() is
  'Suppresses automatic SYNC enqueue only for explicitly activated Kino007A sources and creates a pending approval instead.';

notify pgrst, 'reload schema';

commit;
