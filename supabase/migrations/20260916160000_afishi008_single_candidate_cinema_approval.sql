begin;

alter table public.cinema_publication_approval_movies
  add column if not exists candidate_status text not null default 'pending',
  add column if not exists approve_token_hash text,
  add column if not exists reject_token_hash text,
  add column if not exists telegram_message_id text,
  add column if not exists expires_at timestamptz,
  add column if not exists decided_at timestamptz,
  add column if not exists error_message text;

alter table public.cinema_publication_approval_movies
  drop constraint if exists cinema_publication_approval_movies_candidate_status_check;
alter table public.cinema_publication_approval_movies
  add constraint cinema_publication_approval_movies_candidate_status_check
  check (candidate_status in (
    'pending','sending','sent','approved','rejected','failed','expired','superseded'
  ));

update public.cinema_publication_approval_movies m
set candidate_status = case
      when a.status = 'applied' and m.selected then 'approved'
      when a.status = 'applied' and not m.selected then 'rejected'
      when a.status in ('rejected','failed','expired','superseded') then 'superseded'
      else 'pending'
    end,
    selected = case when a.status = 'applied' then m.selected else false end,
    approve_token_hash = null,
    reject_token_hash = null,
    telegram_message_id = null,
    expires_at = null,
    decided_at = case when a.status = 'applied' then coalesce(a.decided_at, a.applied_at) else null end,
    error_message = null,
    updated_at = now()
from public.cinema_publication_approvals a
where a.id = m.approval_id;

update public.cinema_publication_approvals
set status = 'pending',
    approve_token_hash = null,
    reject_token_hash = null,
    telegram_message_id = null,
    expires_at = null,
    decided_at = null,
    error_message = null,
    updated_at = now()
where status in ('sending','sent');

create unique index if not exists cinema_publication_approval_movies_approve_token_idx
  on public.cinema_publication_approval_movies(approve_token_hash)
  where approve_token_hash is not null;

create unique index if not exists cinema_publication_approval_movies_reject_token_idx
  on public.cinema_publication_approval_movies(reject_token_hash)
  where reject_token_hash is not null;

create unique index if not exists cinema_publication_approval_movies_one_open_candidate_idx
  on public.cinema_publication_approval_movies((1))
  where candidate_status in ('sending','sent');

create index if not exists cinema_publication_approval_movies_dispatch_idx
  on public.cinema_publication_approval_movies(approval_id, candidate_status, score desc, screening_count desc);

create or replace function public.cinema_sync_candidate_state_from_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.status in ('rejected','failed','expired','superseded')
     and new.status is distinct from old.status then
    update public.cinema_publication_approval_movies
    set candidate_status = 'superseded',
        approve_token_hash = null,
        reject_token_hash = null,
        expires_at = null,
        updated_at = now()
    where approval_id = new.id
      and candidate_status in ('pending','sending','sent');
  end if;
  return new;
end;
$function$;

drop trigger if exists afishi008_sync_candidate_state_from_approval
  on public.cinema_publication_approvals;
create trigger afishi008_sync_candidate_state_from_approval
after update of status on public.cinema_publication_approvals
for each row execute function public.cinema_sync_candidate_state_from_approval();

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

  update public.cinema_publication_approval_movies m
  set candidate_status = 'superseded',
      approve_token_hash = null,
      reject_token_hash = null,
      expires_at = null,
      updated_at = now()
  where m.approval_id in (
    select a.id
    from public.cinema_publication_approvals a
    where a.source_config_id = v_parse.source_config_id
      and a.parse_run_id <> p_parse_run_id
  )
    and m.candidate_status in ('pending','sending','sent');

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

create or replace function public.cinema_claim_publication_movie_decision(
  p_token_hash text,
  p_decision text
)
returns table(
  approval_id uuid,
  movie_id uuid,
  decision_state text,
  claimed boolean,
  sync_run_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_movie public.cinema_publication_approval_movies%rowtype;
  v_approval public.cinema_publication_approvals%rowtype;
  v_expected_hash text;
  v_sync_run_id uuid;
begin
  if p_decision not in ('approve','reject')
     or p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid cinema movie approval decision';
  end if;

  select * into v_movie
  from public.cinema_publication_approval_movies
  where approve_token_hash = p_token_hash
     or reject_token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'cinema movie approval token not found';
  end if;

  if v_movie.expires_at is not null
     and v_movie.expires_at <= now()
     and v_movie.candidate_status in ('sending','sent') then
    update public.cinema_publication_approval_movies
    set candidate_status = 'expired',
        approve_token_hash = null,
        reject_token_hash = null,
        decided_at = now(),
        updated_at = now()
    where approval_id = v_movie.approval_id
      and movie_id = v_movie.movie_id;
    return query select v_movie.approval_id, v_movie.movie_id, 'expired'::text, false, null::uuid;
    return;
  end if;

  v_expected_hash := case when p_decision = 'approve'
    then v_movie.approve_token_hash else v_movie.reject_token_hash end;

  if v_expected_hash is distinct from p_token_hash then
    raise exception 'cinema movie approval token decision mismatch';
  end if;

  if v_movie.candidate_status not in ('sending','sent') then
    return query select v_movie.approval_id, v_movie.movie_id, v_movie.candidate_status, false, null::uuid;
    return;
  end if;

  select * into v_approval
  from public.cinema_publication_approvals
  where id = v_movie.approval_id
  for update;

  if not found then
    raise exception 'cinema movie approval parent missing';
  end if;

  if p_decision = 'reject' then
    update public.cinema_publication_approval_movies
    set candidate_status = 'rejected',
        selected = false,
        approve_token_hash = null,
        reject_token_hash = null,
        decided_at = now(),
        updated_at = now()
    where approval_id = v_movie.approval_id
      and movie_id = v_movie.movie_id;

    if v_approval.status <> 'applied'
       and not exists (
         select 1
         from public.cinema_publication_approval_movies m
         where m.approval_id = v_movie.approval_id
           and m.candidate_status in ('pending','sending','sent')
       ) then
      update public.cinema_publication_approvals
      set status = 'rejected',
          decided_at = now(),
          updated_at = now()
      where id = v_movie.approval_id
        and status in ('pending','sending','sent');
    end if;

    return query select v_movie.approval_id, v_movie.movie_id, 'rejected'::text, true, v_approval.sync_run_id;
    return;
  end if;

  if v_approval.status = 'applied' then
    v_sync_run_id := v_approval.sync_run_id;
  elsif v_approval.status in ('pending','sending','sent') then
    v_sync_run_id := public.cinema_apply_parse_run(v_approval.parse_run_id);
    if v_sync_run_id is null then
      raise exception 'cinema single candidate apply parse run returned no sync run';
    end if;

    update public.cinema_publication_approvals
    set status = 'applied',
        sync_run_id = v_sync_run_id,
        applied_at = now(),
        decided_at = now(),
        approve_token_hash = null,
        reject_token_hash = null,
        expires_at = null,
        error_message = null,
        updated_at = now()
    where id = v_movie.approval_id;
  else
    raise exception 'cinema movie approval parent is not actionable: %', v_approval.status;
  end if;

  update public.cinema_publication_approval_movies
  set candidate_status = 'approved',
      selected = true,
      approve_token_hash = null,
      reject_token_hash = null,
      decided_at = now(),
      updated_at = now()
  where approval_id = v_movie.approval_id
    and movie_id = v_movie.movie_id;

  return query select v_movie.approval_id, v_movie.movie_id, 'approved'::text, true, v_sync_run_id;
end;
$function$;

revoke all on function public.cinema_sync_candidate_state_from_approval() from public, anon, authenticated;
revoke all on function public.cinema_request_publication_approval(uuid) from public, anon, authenticated;
revoke all on function public.cinema_claim_publication_movie_decision(text,text) from public, anon, authenticated;

grant execute on function public.cinema_request_publication_approval(uuid) to service_role;
grant execute on function public.cinema_claim_publication_movie_decision(text,text) to service_role;

comment on column public.cinema_publication_approval_movies.candidate_status is
  'AFISHI008 per-movie human approval state. At most one sending/sent candidate exists globally during the pilot.';
comment on function public.cinema_claim_publication_movie_decision(text,text) is
  'AFISHI008 atomic one-movie decision. First approve applies the canonical parse run once; later approves only reveal that movie. Promotions are not published here.';

notify pgrst, 'reload schema';

commit;
