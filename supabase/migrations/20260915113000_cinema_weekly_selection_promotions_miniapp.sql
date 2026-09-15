begin;

alter table public.cinema_publication_approvals
  add column if not exists selection_week_start date,
  add column if not exists selection_week_end date,
  add column if not exists selection_seeded_at timestamptz;

create table if not exists public.cinema_publication_approval_movies (
  approval_id uuid not null references public.cinema_publication_approvals(id) on delete cascade,
  movie_id uuid not null references public.cinema_movies(id) on delete cascade,
  movie_title text not null,
  score integer not null default 0,
  screening_count integer not null default 0,
  day_count integer not null default 0,
  reasons jsonb not null default '{}'::jsonb,
  selected boolean not null default false,
  week_start date not null,
  week_end date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (approval_id, movie_id)
);

create table if not exists public.cinema_publication_approval_promotions (
  approval_id uuid not null references public.cinema_publication_approvals(id) on delete cascade,
  promotion_key text not null,
  title text not null,
  description text not null default '',
  start_date date not null,
  end_date date not null,
  promo_price integer,
  currency text not null default 'CZK',
  discount_text text,
  terms text,
  source_url text not null,
  selected boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (approval_id, promotion_key),
  check (end_date >= start_date),
  check (promo_price is null or promo_price >= 0)
);

create table if not exists public.cinema_promotion_publications (
  source_config_id uuid not null references public.cinema_sources(id) on delete cascade,
  promotion_key text not null,
  approval_id uuid not null references public.cinema_publication_approvals(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (source_config_id, promotion_key),
  unique (activity_id)
);

alter table public.cinema_publication_approval_movies enable row level security;
alter table public.cinema_publication_approval_promotions enable row level security;
alter table public.cinema_promotion_publications enable row level security;

revoke all on table public.cinema_publication_approval_movies from public, anon, authenticated;
revoke all on table public.cinema_publication_approval_promotions from public, anon, authenticated;
revoke all on table public.cinema_promotion_publications from public, anon, authenticated;
grant select, insert, update, delete on public.cinema_publication_approval_movies to service_role;
grant select, insert, update, delete on public.cinema_publication_approval_promotions to service_role;
grant select, insert, update, delete on public.cinema_promotion_publications to service_role;

alter table public.activities add column if not exists event_end_date date;
alter table public.activities add column if not exists event_all_day boolean not null default false;
alter table public.activities drop constraint if exists activities_event_date_range_check;
alter table public.activities
  add constraint activities_event_date_range_check
  check (event_end_date is null or event_end_date >= event_date);

create or replace function public.cinema_seed_publication_selection(p_approval_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_approval public.cinema_publication_approvals%rowtype;
  v_parse public.cinema_parse_runs%rowtype;
  v_week_start date;
  v_week_end date;
  v_today date;
  v_promo jsonb;
  v_promo_start date;
  v_promo_end date;
begin
  select * into v_approval
  from public.cinema_publication_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception 'cinema publication approval not found';
  end if;

  if v_approval.selection_seeded_at is not null then
    return;
  end if;

  select * into v_parse
  from public.cinema_parse_runs
  where id = v_approval.parse_run_id;

  if not found then
    raise exception 'cinema publication parse run not found';
  end if;

  v_today := (now() at time zone 'Europe/Prague')::date;
  v_week_start := date_trunc('week', now() at time zone 'Europe/Prague')::date + 7;
  v_week_end := v_week_start + 6;

  with grouped as (
    select
      st.movie_id,
      coalesce(max(nullif(st.title, '')), max(m.title), 'Film') as movie_title,
      count(*)::integer as screening_count,
      count(distinct st.starts_at_local::date)::integer as day_count,
      bool_or(coalesce(st.normalized_payload->>'format', '') = '4K') as has_4k,
      bool_or(coalesce(st.normalized_payload->>'format', '') = '3D') as has_3d,
      bool_or(lower(coalesce(st.normalized_payload->>'audio_type', '')) like '%dolby%') as has_dolby,
      bool_or(coalesce(st.normalized_payload->'screening_tags', '[]'::jsonb) ? 'D-BOX') as has_dbox,
      bool_or(coalesce(st.normalized_payload->>'version_type', '') = 'original') as has_original,
      max(m.release_year) as release_year,
      max(m.imdb_rating) as imdb_rating,
      max(m.imdb_votes) as imdb_votes
    from public.cinema_screening_staging st
    join public.cinema_movies m on m.id = st.movie_id
    where st.parse_run_id = v_approval.parse_run_id
      and st.safe_to_write = true
      and st.movie_id is not null
      and st.starts_at_local::date between v_week_start and v_week_end
    group by st.movie_id
  ),
  scored as (
    select
      g.*,
      (
        least(g.screening_count, 20)
        + least(g.day_count * 3, 18)
        + case when g.has_4k then 10 else 0 end
        + case when g.has_dolby then 8 else 0 end
        + case when g.has_3d then 5 else 0 end
        + case when g.has_dbox then 4 else 0 end
        + case when g.has_original then 4 else 0 end
        + case when lower(g.movie_title) ~ '(special edition|výročí|anniversary|premi[eé]ra|maraton)' then 18 else 0 end
        + case when g.release_year >= extract(year from v_week_start)::integer then 6 else 0 end
        + case
            when g.imdb_rating >= 8 then 25
            when g.imdb_rating >= 7 then 18
            when g.imdb_rating >= 6.5 then 10
            else 0
          end
        + case
            when g.imdb_votes >= 100000 then 15
            when g.imdb_votes >= 20000 then 10
            when g.imdb_votes >= 5000 then 5
            else 0
          end
      )::integer as score
    from grouped g
  ),
  ranked as (
    select
      s.*,
      row_number() over (
        order by s.score desc, s.screening_count desc, s.day_count desc, s.movie_title asc, s.movie_id
      ) as candidate_rank
    from scored s
  )
  insert into public.cinema_publication_approval_movies(
    approval_id, movie_id, movie_title, score, screening_count, day_count,
    reasons, selected, week_start, week_end
  )
  select
    v_approval.id,
    r.movie_id,
    r.movie_title,
    r.score,
    r.screening_count,
    r.day_count,
    jsonb_build_object(
      'rank', r.candidate_rank,
      'has4k', r.has_4k,
      'hasDolby', r.has_dolby,
      'has3d', r.has_3d,
      'hasDbox', r.has_dbox,
      'hasOriginal', r.has_original,
      'releaseYear', r.release_year,
      'imdbRating', r.imdb_rating,
      'imdbVotes', r.imdb_votes
    ),
    r.candidate_rank <= 8,
    v_week_start,
    v_week_end
  from ranked r
  on conflict (approval_id, movie_id) do nothing;

  if jsonb_typeof(v_parse.metrics->'discount_promotions') = 'array' then
    for v_promo in
      select value from jsonb_array_elements(v_parse.metrics->'discount_promotions')
    loop
      begin
        if coalesce(v_promo->>'key', '') = ''
           or coalesce(v_promo->>'title', '') = ''
           or coalesce(v_promo->>'source_url', '') = ''
           or coalesce(v_promo->>'start_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
           or coalesce(v_promo->>'end_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
          continue;
        end if;

        v_promo_start := (v_promo->>'start_date')::date;
        v_promo_end := (v_promo->>'end_date')::date;

        if v_promo_end < v_today or v_promo_start > v_today + 14 then
          continue;
        end if;

        insert into public.cinema_publication_approval_promotions(
          approval_id, promotion_key, title, description, start_date, end_date,
          promo_price, currency, discount_text, terms, source_url, selected
        ) values (
          v_approval.id,
          v_promo->>'key',
          v_promo->>'title',
          coalesce(v_promo->>'description', ''),
          v_promo_start,
          v_promo_end,
          case when coalesce(v_promo->>'promo_price', '') ~ '^\d+$'
            then (v_promo->>'promo_price')::integer else null end,
          coalesce(nullif(v_promo->>'currency', ''), 'CZK'),
          nullif(v_promo->>'discount_text', ''),
          nullif(v_promo->>'terms', ''),
          v_promo->>'source_url',
          true
        )
        on conflict (approval_id, promotion_key) do nothing;
      exception when others then
        continue;
      end;
    end loop;
  end if;

  update public.cinema_publication_approvals
  set selection_week_start = v_week_start,
      selection_week_end = v_week_end,
      selection_seeded_at = now(),
      updated_at = now()
  where id = v_approval.id;
end;
$function$;

create or replace function public.cinema_seed_publication_selection_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.cinema_seed_publication_selection(new.id);
  return new;
end;
$function$;

drop trigger if exists kino_weekly_seed_publication_selection on public.cinema_publication_approvals;
create trigger kino_weekly_seed_publication_selection
after insert on public.cinema_publication_approvals
for each row execute function public.cinema_seed_publication_selection_trigger();

create or replace function public.cinema_update_publication_selection(
  p_approval_id uuid,
  p_token_hash text,
  p_movie_ids uuid[],
  p_promotion_keys text[]
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_status text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid cinema approval review token';
  end if;

  select status into v_status
  from public.cinema_publication_approvals
  where id = p_approval_id
    and approve_token_hash = p_token_hash
    and status in ('sending', 'sent')
    and (expires_at is null or expires_at > now())
  for update;

  if v_status is null then
    raise exception 'cinema approval review token not valid';
  end if;

  update public.cinema_publication_approval_movies
  set selected = movie_id = any(coalesce(p_movie_ids, '{}'::uuid[])),
      updated_at = now()
  where approval_id = p_approval_id;

  update public.cinema_publication_approval_promotions
  set selected = promotion_key = any(coalesce(p_promotion_keys, '{}'::text[])),
      updated_at = now()
  where approval_id = p_approval_id;

  return true;
end;
$function$;

create or replace function public.cinema_apply_publication_approval(p_approval_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_approval public.cinema_publication_approvals%rowtype;
  v_source public.cinema_sources%rowtype;
  v_venue public.cinema_venues%rowtype;
  v_sync_run_id uuid;
  v_promo public.cinema_publication_approval_promotions%rowtype;
  v_activity_id uuid;
  v_anchor_time time;
begin
  select * into v_approval
  from public.cinema_publication_approvals
  where id = p_approval_id
  for update;

  if not found or v_approval.status <> 'applying' then
    raise exception 'cinema approval is not applying';
  end if;

  select * into v_source
  from public.cinema_sources
  where id = v_approval.source_config_id;

  if not found then
    raise exception 'cinema approval source missing';
  end if;

  select * into v_venue
  from public.cinema_venues
  where id = v_source.venue_id;

  if not found then
    raise exception 'cinema approval venue missing';
  end if;

  v_sync_run_id := public.cinema_apply_parse_run(v_approval.parse_run_id);
  if v_sync_run_id is null then
    raise exception 'cinema apply parse run returned no sync run';
  end if;

  for v_promo in
    select *
    from public.cinema_publication_approval_promotions
    where approval_id = p_approval_id
      and selected = true
    order by start_date, title
  loop
    if exists (
      select 1
      from public.cinema_promotion_publications
      where source_config_id = v_approval.source_config_id
        and promotion_key = v_promo.promotion_key
    ) then
      continue;
    end if;

    select min((s.starts_at at time zone coalesce(v_venue.timezone, 'Europe/Prague'))::time)
    into v_anchor_time
    from public.cinema_screenings s
    where s.cinema_id = v_source.venue_id
      and s.status = 'scheduled'
      and (s.starts_at at time zone coalesce(v_venue.timezone, 'Europe/Prague'))::date = v_promo.start_date;

    if v_anchor_time is null then
      raise exception 'cinema promotion missing real screening anchor time: %', v_promo.promotion_key;
    end if;

    insert into public.activities(
      category_id,
      activity_ru,
      activity_cs,
      title_ru,
      title_cs,
      description_ru,
      description_cs,
      event_date,
      event_time,
      event_end_date,
      event_all_day,
      city_id,
      address,
      location_url,
      participant_note,
      activity_type,
      metadata,
      price,
      capacity,
      organizer,
      organizer_key,
      visibility,
      urgent,
      popular
    ) values (
      'activities',
      'Кино',
      'Kino',
      v_promo.title,
      v_promo.title,
      v_promo.description,
      v_promo.description,
      v_promo.start_date,
      v_anchor_time,
      v_promo.end_date,
      true,
      v_venue.city_id,
      coalesce(v_venue.address, v_venue.name),
      null,
      v_promo.terms,
      'culture',
      jsonb_build_object(
        'cinemaPromotion', jsonb_build_object(
          'promotionKey', v_promo.promotion_key,
          'sourceUrl', v_promo.source_url,
          'venueId', v_venue.id,
          'venueName', v_venue.name,
          'allDay', true,
          'startDate', v_promo.start_date,
          'endDate', v_promo.end_date,
          'promoPrice', v_promo.promo_price,
          'currency', v_promo.currency,
          'discountText', v_promo.discount_text
        )
      ),
      coalesce(v_promo.promo_price, 0),
      100,
      'GO IRL · ' || v_venue.name,
      'system:cinema-promotions',
      'public',
      false,
      true
    )
    returning id into v_activity_id;

    insert into public.cinema_promotion_publications(
      source_config_id, promotion_key, approval_id, activity_id
    ) values (
      v_approval.source_config_id, v_promo.promotion_key, p_approval_id, v_activity_id
    );
  end loop;

  update public.cinema_publication_approvals
  set status = 'applied',
      sync_run_id = v_sync_run_id,
      applied_at = now(),
      error_message = null,
      updated_at = now()
  where id = p_approval_id
    and status = 'applying';

  return v_sync_run_id;
end;
$function$;

create or replace function public.city_posters_cinema_catalog(
  p_city_id text,
  p_limit integer default 800
)
returns table (
  screening_id uuid,
  movie_id uuid,
  cinema_id uuid,
  cinema_name text,
  cinema_address text,
  venue_timezone text,
  movie_title text,
  original_title text,
  release_year integer,
  duration_minutes integer,
  genres jsonb,
  age_rating text,
  imdb_rating numeric,
  poster_url text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  local_date date,
  local_time text,
  audio_language text,
  subtitle_languages jsonb,
  version_type text,
  format text,
  auditorium text,
  screening_tags jsonb,
  ticket_url text,
  source_url text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    s.id as screening_id,
    s.movie_id,
    s.cinema_id,
    v.name as cinema_name,
    v.address as cinema_address,
    coalesce(v.timezone, 'Europe/Prague') as venue_timezone,
    m.title as movie_title,
    m.original_title,
    m.release_year,
    m.duration_minutes,
    m.genres,
    m.age_rating,
    m.imdb_rating,
    m.poster_url,
    coalesce(m.synopsis_generated, '') as description,
    s.starts_at,
    s.ends_at,
    (s.starts_at at time zone coalesce(v.timezone, 'Europe/Prague'))::date as local_date,
    to_char(s.starts_at at time zone coalesce(v.timezone, 'Europe/Prague'), 'HH24:MI') as local_time,
    s.audio_language,
    s.subtitle_languages,
    s.version_type,
    s.format,
    s.auditorium,
    s.screening_tags,
    s.ticket_url,
    s.source_url
  from public.cinema_screenings s
  join public.cinema_venues v on v.id = s.cinema_id
  join public.cinema_movies m on m.id = s.movie_id
  where v.city_id = nullif(btrim(p_city_id), '')
    and v.active = true
    and exists (
      select 1
      from public.cinema_sync_runs sr
      where sr.cinema_id = v.id
        and sr.status = 'success'
        and sr.is_complete = true
    )
    and s.status = 'scheduled'
    and s.starts_at >= now() - interval '30 minutes'
    and (
      not exists (
        select 1
        from public.cinema_publication_approvals a
        join public.cinema_sources src on src.id = a.source_config_id
        join public.cinema_publication_approval_movies sel on sel.approval_id = a.id
        where a.status = 'applied'
          and src.venue_id = s.cinema_id
          and (s.starts_at at time zone coalesce(v.timezone, 'Europe/Prague'))::date
              between sel.week_start and sel.week_end
      )
      or exists (
        select 1
        from public.cinema_publication_approvals a
        join public.cinema_sources src on src.id = a.source_config_id
        join public.cinema_publication_approval_movies sel on sel.approval_id = a.id
        where a.status = 'applied'
          and src.venue_id = s.cinema_id
          and sel.selected = true
          and sel.movie_id = s.movie_id
          and (s.starts_at at time zone coalesce(v.timezone, 'Europe/Prague'))::date
              between sel.week_start and sel.week_end
      )
    )
  order by s.starts_at asc
  limit greatest(1, least(coalesce(p_limit, 800), 800));
$$;

revoke all on function public.cinema_seed_publication_selection(uuid) from public, anon, authenticated;
revoke all on function public.cinema_seed_publication_selection_trigger() from public, anon, authenticated;
revoke all on function public.cinema_update_publication_selection(uuid,text,uuid[],text[]) from public, anon, authenticated;
revoke all on function public.cinema_apply_publication_approval(uuid) from public, anon, authenticated;

grant execute on function public.cinema_seed_publication_selection(uuid) to service_role;
grant execute on function public.cinema_update_publication_selection(uuid,text,uuid[],text[]) to service_role;
grant execute on function public.cinema_apply_publication_approval(uuid) to service_role;

revoke all on function public.city_posters_cinema_catalog(text, integer) from public;
grant execute on function public.city_posters_cinema_catalog(text, integer) to anon, authenticated, service_role;

comment on table public.cinema_publication_approval_movies is
  'Weekly Mon-Sun movie candidate selection for Kino007A. Canonical screenings stay complete; only selected movie_ids are public in the covered week after approval.';
comment on table public.cinema_publication_approval_promotions is
  'Discount-only cinema promotion candidates included in the human approval surface.';
comment on table public.cinema_promotion_publications is
  'Idempotency ledger mapping an approved cinema discount promotion to exactly one Activity.';
comment on column public.activities.event_all_day is
  'True when the Activity spans the whole source-defined date window. event_time remains a real source-derived anchor for legacy clients, never an invented time.';
comment on column public.activities.event_end_date is
  'Inclusive final calendar date for date-range Activities; null for single-day Activities.';

notify pgrst, 'reload schema';

commit;
