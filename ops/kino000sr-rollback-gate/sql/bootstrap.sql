\set ON_ERROR_STOP on

CREATE ROLE service_role NOLOGIN;
CREATE ROLE gate_untrusted NOLOGIN;

GRANT USAGE, CREATE ON SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE service_role REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE public.cinema_catalog_movies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id text NOT NULL,
  selection_week_start date NOT NULL,
  selection_week_end date NOT NULL,
  rank integer NOT NULL,
  source_movie_key text NOT NULL,
  imdb_id text,
  canonical_title text NOT NULL,
  original_title text,
  release_year integer,
  duration_minutes integer NOT NULL,
  genres jsonb NOT NULL DEFAULT '[]'::jsonb,
  age_rating text,
  imdb_rating numeric,
  poster_url text NOT NULL,
  description text NOT NULL,
  director text,
  lead_actors jsonb NOT NULL DEFAULT '[]'::jsonb,
  translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  readiness jsonb NOT NULL DEFAULT '{}'::jsonb,
  publication_state text NOT NULL DEFAULT 'ready',
  approved_by text,
  approved_at timestamptz,
  published_event_id uuid,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, selection_week_start, source_movie_key),
  UNIQUE (city_id, selection_week_start, rank)
);
CREATE TABLE public.cinema_catalog_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_movie_id uuid NOT NULL REFERENCES public.cinema_catalog_movies(id),
  source_screening_key text NOT NULL,
  cinema_key text NOT NULL,
  cinema_name text NOT NULL,
  cinema_address text,
  venue_timezone text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  audio_language text,
  subtitle_languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  version_type text,
  format text,
  auditorium text,
  screening_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ticket_url text NOT NULL,
  source_url text,
  source_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_movie_id, source_screening_key)
);
