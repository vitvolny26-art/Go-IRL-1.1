begin;

create table if not exists public.cinema_weekly_localization_search_results (
  weekly_selection_id uuid not null,
  candidate_id uuid not null,
  movie_id uuid not null references public.cinema_movies(id) on delete restrict,
  locale text not null,
  capital text not null,
  country_code text not null,
  status text not null,
  localized_title text,
  synopsis text,
  genres jsonb not null default '[]'::jsonb,
  age_rating text,
  version_label text,
  source_url text,
  source_name text,
  source_kind text,
  confidence numeric,
  match_basis text,
  metadata jsonb not null default '{}'::jsonb,
  searched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (weekly_selection_id, candidate_id, locale),
  foreign key (weekly_selection_id, candidate_id)
    references public.cinema_weekly_publication_candidates(weekly_selection_id, candidate_id)
    on delete cascade,
  check ((locale, capital, country_code) in (
    ('ru','Moscow','RU'),
    ('uk','Kyiv','UA'),
    ('cs','Prague','CZ'),
    ('en','London','GB'),
    ('pl','Warsaw','PL'),
    ('sk','Bratislava','SK')
  )),
  check (status in ('matched','not_found','mismatch','ambiguous','provider_error')),
  check (source_kind is null or source_kind in ('official_cinema','distributor','tmdb')),
  check (match_basis is null or match_basis in ('external_id','title_year','title_year_duration')),
  check (confidence is null or (confidence >= 0 and confidence <= 1)),
  check (
    status <> 'matched'
    or (
      (nullif(btrim(localized_title), '') is not null or nullif(btrim(synopsis), '') is not null)
      and source_url ~ '^https://'
      and nullif(btrim(source_name), '') is not null
      and source_kind is not null
      and confidence is not null
      and match_basis is not null
    )
  ),
  check (
    status = 'matched'
    or (
      localized_title is null
      and synopsis is null
      and source_url is null
      and source_name is null
      and source_kind is null
      and confidence is null
      and match_basis is null
    )
  )
);

create index if not exists cinema_weekly_localization_search_results_status_idx
  on public.cinema_weekly_localization_search_results(weekly_selection_id, status, locale);

alter table public.cinema_weekly_localization_search_results enable row level security;

revoke all on public.cinema_weekly_localization_search_results from public, anon, authenticated;
grant select, insert, update, delete on public.cinema_weekly_localization_search_results to service_role;

comment on table public.cinema_weekly_localization_search_results is
  'Kino000M provenance-preserving capital localization search outcomes for locked weekly cinema candidates. Search results never overwrite cinema_movies and do not authorize publication.';

notify pgrst, 'reload schema';

commit;
