begin;

create table if not exists public.cinema_daily_movie_city_candidates (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.cinema_movies(id) on delete cascade,
  city_id text not null check (btrim(city_id) <> ''),
  city_name text not null check (btrim(city_name) <> ''),
  title text not null check (btrim(title) <> ''),
  showing_from date not null,
  showing_until date not null,
  screening_count integer not null check (screening_count > 0),
  day_count integer not null check (day_count > 0 and day_count <= screening_count),
  cinemas jsonb not null default '[]'::jsonb check (jsonb_typeof(cinemas) = 'array'),
  venue_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(venue_ids) = 'array'),
  formats jsonb not null default '[]'::jsonb check (jsonb_typeof(formats) = 'array'),
  audio_types jsonb not null default '[]'::jsonb check (jsonb_typeof(audio_types) = 'array'),
  version_types jsonb not null default '[]'::jsonb check (jsonb_typeof(version_types) = 'array'),
  score integer not null default 0 check (score >= 0),
  priority text not null check (priority in ('ignore','store','interesting','moderation','high_priority')),
  reasons jsonb not null default '{}'::jsonb check (jsonb_typeof(reasons) = 'object'),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','superseded')),
  decision_status text not null default 'pending' check (decision_status in ('pending','approved','rejected')),
  decided_at timestamptz,
  decided_by_user_key text references public.app_users(user_key) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cinema_daily_movie_city_candidates_window_check check (showing_until >= showing_from),
  constraint cinema_daily_movie_city_candidates_decision_check check (
    (decision_status = 'pending' and decided_at is null and decided_by_user_key is null)
    or (decision_status in ('approved','rejected') and decided_at is not null)
  ),
  constraint cinema_daily_movie_city_candidates_identity_key
    unique (movie_id, city_id, showing_from, showing_until)
);

create unique index if not exists cinema_daily_movie_city_candidates_one_active_window_idx
  on public.cinema_daily_movie_city_candidates(movie_id, city_id)
  where lifecycle_status = 'active';

create index if not exists cinema_daily_movie_city_candidates_review_queue_idx
  on public.cinema_daily_movie_city_candidates(
    lifecycle_status,
    decision_status,
    priority,
    score desc,
    showing_from,
    city_id
  );

create index if not exists cinema_daily_movie_city_candidates_city_window_idx
  on public.cinema_daily_movie_city_candidates(city_id, showing_from, showing_until);

alter table public.cinema_daily_movie_city_candidates enable row level security;

revoke all on table public.cinema_daily_movie_city_candidates from public, anon, authenticated;
grant select, insert, update, delete on public.cinema_daily_movie_city_candidates to service_role;

create or replace function public.cinema_persist_daily_movie_city_candidates(
  p_city_id text,
  p_candidates jsonb,
  p_observed_at timestamptz default now()
)
returns table(
  candidate_id uuid,
  movie_id uuid,
  city_id text,
  showing_from date,
  showing_until date,
  lifecycle_status text,
  decision_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_input_count integer;
  v_distinct_movie_count integer;
begin
  if p_city_id is null or btrim(p_city_id) = '' or length(p_city_id) > 80 then
    raise exception 'cinema_daily_candidate_city_invalid';
  end if;
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'cinema_daily_candidate_payload_invalid';
  end if;
  if p_observed_at is null then
    raise exception 'cinema_daily_candidate_observed_at_required';
  end if;

  v_input_count := jsonb_array_length(p_candidates);
  if v_input_count > 500 then
    raise exception 'cinema_daily_candidate_payload_too_large';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cinema_daily_candidates:' || p_city_id, 0)
  );

  with input as (
    select *
    from jsonb_to_recordset(p_candidates) as x(
      movie_id uuid,
      city_id text,
      city_name text,
      title text,
      showing_from date,
      showing_until date,
      screening_count integer,
      day_count integer,
      cinemas jsonb,
      venue_ids jsonb,
      formats jsonb,
      audio_types jsonb,
      version_types jsonb,
      score integer,
      priority text,
      reasons jsonb
    )
  )
  select count(distinct i.movie_id) into v_distinct_movie_count
  from input i;

  if v_distinct_movie_count <> v_input_count then
    raise exception 'cinema_daily_candidate_duplicate_movie_city';
  end if;

  if exists (
    with input as (
      select *
      from jsonb_to_recordset(p_candidates) as x(
        movie_id uuid,
        city_id text,
        city_name text,
        title text,
        showing_from date,
        showing_until date,
        screening_count integer,
        day_count integer,
        cinemas jsonb,
        venue_ids jsonb,
        formats jsonb,
        audio_types jsonb,
        version_types jsonb,
        score integer,
        priority text,
        reasons jsonb
      )
    )
    select 1
    from input
    where movie_id is null
       or city_id is distinct from p_city_id
       or btrim(coalesce(city_name, '')) = ''
       or btrim(coalesce(title, '')) = ''
       or showing_from is null
       or showing_until is null
       or showing_until < showing_from
       or coalesce(screening_count, 0) <= 0
       or coalesce(day_count, 0) <= 0
       or day_count > screening_count
       or jsonb_typeof(coalesce(cinemas, 'null'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(venue_ids, 'null'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(formats, 'null'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(audio_types, 'null'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(version_types, 'null'::jsonb)) <> 'array'
       or coalesce(score, -1) < 0
       or priority not in ('ignore','store','interesting','moderation','high_priority')
       or jsonb_typeof(coalesce(reasons, 'null'::jsonb)) <> 'object'
  ) then
    raise exception 'cinema_daily_candidate_payload_invalid';
  end if;

  with input as (
    select x.movie_id, x.city_id, x.showing_from, x.showing_until
    from jsonb_to_recordset(p_candidates) as x(
      movie_id uuid,
      city_id text,
      city_name text,
      title text,
      showing_from date,
      showing_until date,
      screening_count integer,
      day_count integer,
      cinemas jsonb,
      venue_ids jsonb,
      formats jsonb,
      audio_types jsonb,
      version_types jsonb,
      score integer,
      priority text,
      reasons jsonb
    )
  )
  update public.cinema_daily_movie_city_candidates existing
  set lifecycle_status = 'superseded',
      updated_at = now()
  where existing.city_id = p_city_id
    and existing.lifecycle_status = 'active'
    and not exists (
      select 1
      from input i
      where i.movie_id = existing.movie_id
        and i.city_id = existing.city_id
        and i.showing_from = existing.showing_from
        and i.showing_until = existing.showing_until
    );

  insert into public.cinema_daily_movie_city_candidates(
    movie_id,
    city_id,
    city_name,
    title,
    showing_from,
    showing_until,
    screening_count,
    day_count,
    cinemas,
    venue_ids,
    formats,
    audio_types,
    version_types,
    score,
    priority,
    reasons,
    lifecycle_status,
    first_seen_at,
    last_seen_at,
    updated_at
  )
  select
    i.movie_id,
    i.city_id,
    i.city_name,
    i.title,
    i.showing_from,
    i.showing_until,
    i.screening_count,
    i.day_count,
    i.cinemas,
    i.venue_ids,
    i.formats,
    i.audio_types,
    i.version_types,
    i.score,
    i.priority,
    i.reasons,
    'active',
    p_observed_at,
    p_observed_at,
    now()
  from jsonb_to_recordset(p_candidates) as i(
    movie_id uuid,
    city_id text,
    city_name text,
    title text,
    showing_from date,
    showing_until date,
    screening_count integer,
    day_count integer,
    cinemas jsonb,
    venue_ids jsonb,
    formats jsonb,
    audio_types jsonb,
    version_types jsonb,
    score integer,
    priority text,
    reasons jsonb
  )
  on conflict (movie_id, city_id, showing_from, showing_until)
  do update set
    city_name = excluded.city_name,
    title = excluded.title,
    screening_count = excluded.screening_count,
    day_count = excluded.day_count,
    cinemas = excluded.cinemas,
    venue_ids = excluded.venue_ids,
    formats = excluded.formats,
    audio_types = excluded.audio_types,
    version_types = excluded.version_types,
    score = excluded.score,
    priority = excluded.priority,
    reasons = excluded.reasons,
    lifecycle_status = 'active',
    last_seen_at = excluded.last_seen_at,
    updated_at = now();

  return query
  with input as (
    select x.movie_id, x.city_id, x.showing_from, x.showing_until
    from jsonb_to_recordset(p_candidates) as x(
      movie_id uuid,
      city_id text,
      city_name text,
      title text,
      showing_from date,
      showing_until date,
      screening_count integer,
      day_count integer,
      cinemas jsonb,
      venue_ids jsonb,
      formats jsonb,
      audio_types jsonb,
      version_types jsonb,
      score integer,
      priority text,
      reasons jsonb
    )
  )
  select
    c.id,
    c.movie_id,
    c.city_id,
    c.showing_from,
    c.showing_until,
    c.lifecycle_status,
    c.decision_status
  from public.cinema_daily_movie_city_candidates c
  join input i
    on i.movie_id = c.movie_id
   and i.city_id = c.city_id
   and i.showing_from = c.showing_from
   and i.showing_until = c.showing_until
  order by c.score desc, c.title asc, c.movie_id;
end;
$function$;

revoke all on function public.cinema_persist_daily_movie_city_candidates(text,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.cinema_persist_daily_movie_city_candidates(text,jsonb,timestamptz)
  to service_role;

comment on table public.cinema_daily_movie_city_candidates is
  'AFISHI000 durable daily Cinema candidate ledger. Approval identity is exact movie_id + city_id + showing_from + showing_until; changed windows create a new pending decision identity.';
comment on column public.cinema_daily_movie_city_candidates.decision_status is
  'Owner decision for this exact movie+city+showing-window identity. Decisions never carry to a different showing window.';
comment on function public.cinema_persist_daily_movie_city_candidates(text,jsonb,timestamptz) is
  'AFISHI000 service-role-only atomic per-city snapshot persistence. Reuses exact identities, preserves their decisions, and supersedes active identities absent from the new city snapshot.';

notify pgrst, 'reload schema';

commit;
