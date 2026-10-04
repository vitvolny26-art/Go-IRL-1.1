begin;

create table if not exists public.cinema_weekly_publication_selections (
  id uuid primary key default gen_random_uuid(),
  city_id text not null,
  week_start date not null,
  week_end date not null,
  state text not null default 'collecting',
  top_limit integer not null default 10,
  locked_at timestamptz,
  review_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, week_start, week_end),
  check (week_end >= week_start),
  check (top_limit between 1 and 10),
  check (state in (
    'collecting','ranked','enriching','review_ready','waiting_approval',
    'publishing_one','waiting_next_approval','closed'
  ))
);

create table if not exists public.cinema_weekly_publication_candidates (
  weekly_selection_id uuid not null references public.cinema_weekly_publication_selections(id) on delete cascade,
  candidate_id uuid not null references public.cinema_daily_movie_city_candidates(id) on delete restrict,
  movie_id uuid not null references public.cinema_movies(id) on delete restrict,
  rank integer not null,
  showing_from date not null,
  showing_until date not null,
  score integer not null,
  publication_state text not null default 'queued',
  publication_authorized boolean not null default false,
  approved_at timestamptz,
  published_at timestamptz,
  published_event_id uuid references public.city_posters_events(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (weekly_selection_id, candidate_id),
  unique (weekly_selection_id, rank),
  unique (weekly_selection_id, movie_id),
  check (rank between 1 and 10),
  check (showing_until >= showing_from),
  check (score >= 0),
  check (publication_state in ('queued','approved','publishing','published','rejected','skipped','blocked')),
  check (not publication_authorized or publication_state in ('approved','publishing','published'))
);

create table if not exists public.cinema_weekly_publication_approvals (
  id uuid primary key default gen_random_uuid(),
  weekly_selection_id uuid not null,
  candidate_id uuid not null,
  movie_id uuid not null references public.cinema_movies(id) on delete restrict,
  city_id text not null,
  showing_from date not null,
  showing_until date not null,
  status text not null default 'approved',
  approved_by_user_key text not null,
  approved_at timestamptz not null default now(),
  consumed_at timestamptz,
  revoked_at timestamptz,
  published_event_id uuid references public.city_posters_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (weekly_selection_id, candidate_id)
    references public.cinema_weekly_publication_candidates(weekly_selection_id, candidate_id)
    on delete cascade,
  unique (weekly_selection_id, candidate_id),
  check (showing_until >= showing_from),
  check (status in ('approved','consumed','revoked')),
  check (length(btrim(approved_by_user_key)) between 1 and 240)
);

create unique index if not exists cinema_weekly_publication_one_open_approval_idx
  on public.cinema_weekly_publication_approvals(weekly_selection_id)
  where status = 'approved' and consumed_at is null;

create index if not exists cinema_weekly_publication_candidates_state_idx
  on public.cinema_weekly_publication_candidates(weekly_selection_id, publication_state, rank);

alter table public.cinema_weekly_publication_selections enable row level security;
alter table public.cinema_weekly_publication_candidates enable row level security;
alter table public.cinema_weekly_publication_approvals enable row level security;

revoke all on public.cinema_weekly_publication_selections from public, anon, authenticated;
revoke all on public.cinema_weekly_publication_candidates from public, anon, authenticated;
revoke all on public.cinema_weekly_publication_approvals from public, anon, authenticated;

grant select, insert, update, delete on public.cinema_weekly_publication_selections to service_role;
grant select, insert, update, delete on public.cinema_weekly_publication_candidates to service_role;
grant select, insert, update, delete on public.cinema_weekly_publication_approvals to service_role;

create or replace function public.cinema_authorize_weekly_publication_candidate(
  p_weekly_selection_id uuid,
  p_candidate_id uuid,
  p_movie_id uuid,
  p_city_id text,
  p_showing_from date,
  p_showing_until date,
  p_approved_by_user_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_selection public.cinema_weekly_publication_selections%rowtype;
  v_candidate public.cinema_weekly_publication_candidates%rowtype;
  v_existing public.cinema_weekly_publication_approvals%rowtype;
  v_approval_id uuid;
begin
  if nullif(btrim(p_approved_by_user_key), '') is null then
    raise exception 'cinema weekly publication owner identity missing';
  end if;

  select * into v_selection
  from public.cinema_weekly_publication_selections
  where id = p_weekly_selection_id
  for update;

  if not found
     or v_selection.city_id <> p_city_id
     or v_selection.state not in ('review_ready','waiting_approval','waiting_next_approval') then
    raise exception 'cinema weekly selection is not approval-ready';
  end if;

  select * into v_candidate
  from public.cinema_weekly_publication_candidates
  where weekly_selection_id = p_weekly_selection_id
    and candidate_id = p_candidate_id
  for update;

  if not found
     or v_candidate.movie_id <> p_movie_id
     or v_candidate.showing_from <> p_showing_from
     or v_candidate.showing_until <> p_showing_until
     or v_candidate.rank < 1
     or v_candidate.rank > v_selection.top_limit
     or v_candidate.publication_state not in ('queued','approved') then
    raise exception 'cinema weekly candidate identity mismatch';
  end if;

  if exists (
    select 1
    from public.cinema_weekly_publication_approvals a
    where a.weekly_selection_id = p_weekly_selection_id
      and a.candidate_id <> p_candidate_id
      and a.status = 'approved'
      and a.consumed_at is null
  ) then
    raise exception 'cinema weekly publication another candidate waiting';
  end if;

  select * into v_existing
  from public.cinema_weekly_publication_approvals
  where weekly_selection_id = p_weekly_selection_id
    and candidate_id = p_candidate_id
  for update;

  if found and v_existing.status = 'consumed' then
    raise exception 'cinema weekly candidate already published';
  end if;

  if found then
    update public.cinema_weekly_publication_approvals
    set movie_id = p_movie_id,
        city_id = p_city_id,
        showing_from = p_showing_from,
        showing_until = p_showing_until,
        status = 'approved',
        approved_by_user_key = btrim(p_approved_by_user_key),
        approved_at = now(),
        consumed_at = null,
        revoked_at = null,
        published_event_id = null,
        updated_at = now()
    where id = v_existing.id
    returning id into v_approval_id;
  else
    insert into public.cinema_weekly_publication_approvals(
      weekly_selection_id, candidate_id, movie_id, city_id,
      showing_from, showing_until, status, approved_by_user_key
    ) values (
      p_weekly_selection_id, p_candidate_id, p_movie_id, p_city_id,
      p_showing_from, p_showing_until, 'approved', btrim(p_approved_by_user_key)
    )
    returning id into v_approval_id;
  end if;

  update public.cinema_weekly_publication_candidates
  set publication_state = 'approved',
      publication_authorized = true,
      approved_at = now(),
      updated_at = now()
  where weekly_selection_id = p_weekly_selection_id
    and candidate_id = p_candidate_id;

  update public.cinema_weekly_publication_selections
  set state = 'waiting_approval',
      updated_at = now()
  where id = p_weekly_selection_id;

  return v_approval_id;
end;
$function$;

create or replace function public.cinema_check_weekly_publication_approval(
  p_approval_id uuid,
  p_weekly_selection_id uuid,
  p_candidate_id uuid,
  p_movie_id uuid,
  p_city_id text,
  p_showing_from date,
  p_showing_until date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.cinema_weekly_publication_selections s
    join public.cinema_weekly_publication_candidates c
      on c.weekly_selection_id = s.id
    join public.cinema_weekly_publication_approvals a
      on a.weekly_selection_id = c.weekly_selection_id
     and a.candidate_id = c.candidate_id
    where s.id = p_weekly_selection_id
      and s.city_id = p_city_id
      and s.state in ('waiting_approval','waiting_next_approval')
      and c.candidate_id = p_candidate_id
      and c.movie_id = p_movie_id
      and c.showing_from = p_showing_from
      and c.showing_until = p_showing_until
      and c.rank between 1 and s.top_limit
      and c.publication_state = 'approved'
      and c.publication_authorized = true
      and a.id = p_approval_id
      and a.movie_id = p_movie_id
      and a.city_id = p_city_id
      and a.showing_from = p_showing_from
      and a.showing_until = p_showing_until
      and a.status = 'approved'
      and a.consumed_at is null
  );
$function$;

create or replace function public.cinema_consume_weekly_publication_approval(
  p_approval_id uuid,
  p_weekly_selection_id uuid,
  p_candidate_id uuid,
  p_movie_id uuid,
  p_city_id text,
  p_showing_from date,
  p_showing_until date,
  p_event_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_approval_id uuid;
begin
  update public.cinema_weekly_publication_approvals
  set status = 'consumed',
      consumed_at = now(),
      published_event_id = p_event_id,
      updated_at = now()
  where id = p_approval_id
    and weekly_selection_id = p_weekly_selection_id
    and candidate_id = p_candidate_id
    and movie_id = p_movie_id
    and city_id = p_city_id
    and showing_from = p_showing_from
    and showing_until = p_showing_until
    and status = 'approved'
    and consumed_at is null
  returning id into v_approval_id;

  if v_approval_id is null then
    return false;
  end if;

  update public.cinema_weekly_publication_candidates
  set publication_state = 'published',
      publication_authorized = true,
      published_at = now(),
      published_event_id = p_event_id,
      updated_at = now()
  where weekly_selection_id = p_weekly_selection_id
    and candidate_id = p_candidate_id
    and movie_id = p_movie_id
    and publication_state = 'approved'
    and publication_authorized = true;

  if not found then
    raise exception 'cinema weekly publication candidate state changed';
  end if;

  update public.cinema_weekly_publication_selections
  set state = 'waiting_next_approval',
      updated_at = now()
  where id = p_weekly_selection_id
    and state in ('waiting_approval','waiting_next_approval');

  if not found then
    raise exception 'cinema weekly publication selection state changed';
  end if;

  return true;
end;
$function$;

revoke all on function public.cinema_authorize_weekly_publication_candidate(uuid,uuid,uuid,text,date,date,text)
  from public, anon, authenticated;
revoke all on function public.cinema_check_weekly_publication_approval(uuid,uuid,uuid,uuid,text,date,date)
  from public, anon, authenticated;
revoke all on function public.cinema_consume_weekly_publication_approval(uuid,uuid,uuid,uuid,text,date,date,uuid)
  from public, anon, authenticated;

grant execute on function public.cinema_authorize_weekly_publication_candidate(uuid,uuid,uuid,text,date,date,text)
  to service_role;
grant execute on function public.cinema_check_weekly_publication_approval(uuid,uuid,uuid,uuid,text,date,date)
  to service_role;
grant execute on function public.cinema_consume_weekly_publication_approval(uuid,uuid,uuid,uuid,text,date,date,uuid)
  to service_role;

comment on table public.cinema_weekly_publication_selections is
  'Kino000A weekly cinema governance. Top candidates are review inventory, never publication authorization.';
comment on table public.cinema_weekly_publication_candidates is
  'Kino000A immutable weekly candidate identity snapshot and one-at-a-time publication state.';
comment on table public.cinema_weekly_publication_approvals is
  'Kino000A exact owner approval bound to one weekly selection and one candidate identity.';
comment on function public.cinema_authorize_weekly_publication_candidate(uuid,uuid,uuid,text,date,date,text) is
  'Kino000A creates one exact owner authorization. A weekly selection can have at most one unconsumed approved candidate.';
comment on function public.cinema_check_weekly_publication_approval(uuid,uuid,uuid,uuid,text,date,date) is
  'Kino000A fail-closed preflight for one candidate publication.';
comment on function public.cinema_consume_weekly_publication_approval(uuid,uuid,uuid,uuid,text,date,date,uuid) is
  'Kino000A one-time approval consumption after one GO IRL cinema event is materialized.';

notify pgrst, 'reload schema';

commit;
