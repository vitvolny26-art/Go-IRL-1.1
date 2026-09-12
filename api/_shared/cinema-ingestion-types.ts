export type CinemaSourceConfig = {
  id: string;
  venue_id: string;
  source_id: string;
  adapter_key: string;
  source_url: string;
  fetch_method: string;
  parser_version: string;
  timezone: string;
  enabled: boolean;
  fetch_interval_minutes: number;
  expected_horizon_days: number;
  min_records: number;
  config: Record<string, unknown>;
};

export type CinemaFetchedPage = {
  url: string;
  status: number;
  body: string;
};

export type CinemaRawSnapshotPayload = {
  adapter_key: string;
  fetched_at: string;
  root_url: string;
  pages: CinemaFetchedPage[];
  failures: Array<{ url: string; error: string }>;
};

export type CinemaNormalizedScreening = {
  external_screening_id: string | null;
  screening_fingerprint: string;
  external_movie_id: string;
  movie_fingerprint: string;
  title: string;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  starts_at_local: string;
  starts_at: string;
  timezone: string;
  audio_language: string | null;
  subtitle_languages: string[];
  audio_type: string | null;
  version_type: string | null;
  format: string | null;
  auditorium: string | null;
  screening_tags: string[];
  ticket_url: string | null;
  source_url: string;
  raw_language: string | null;
  raw_version: string | null;
};

export type CinemaParseResult = {
  rows: CinemaNormalizedScreening[];
  records_parsed: number;
  records_valid: number;
  records_rejected: number;
  min_schedule_date: string | null;
  max_schedule_date: string | null;
  expected_until: string;
  fetch_complete: boolean;
  parser_complete: boolean;
  scope_complete: boolean;
  fatal_error: boolean;
  zero_result: boolean;
  errors: string[];
  metrics: Record<string, unknown>;
};

export type CinemaAdapter = {
  key: string;
  fetchSnapshot(source: CinemaSourceConfig): Promise<CinemaRawSnapshotPayload>;
  parseSnapshot(source: CinemaSourceConfig, payload: CinemaRawSnapshotPayload): CinemaParseResult;
};
