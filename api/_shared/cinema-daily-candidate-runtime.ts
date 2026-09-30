import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDailyMovieCityCandidates,
  type CinemaDailyCandidateScreening,
  type CinemaDailyMovieCityCandidate,
} from "./cinema-daily-candidates.js";

type CinemaDailyCandidateDbRow = {
  id: string;
  movie_id: string;
  cinema_id: string;
  starts_at: string;
  format: string | null;
  audio_type: string | null;
  version_type: string | null;
  screening_tags: unknown;
  status: string;
  cinema_venues: {
    city_id: string;
    city_name: string;
    name: string;
    timezone: string;
    active: boolean;
  } | Array<{
    city_id: string;
    city_name: string;
    name: string;
    timezone: string;
    active: boolean;
  }> | null;
  cinema_movies: {
    title: string;
    release_year: number | null;
    imdb_rating: number | string | null;
    imdb_votes: number | null;
  } | Array<{
    title: string;
    release_year: number | null;
    imdb_rating: number | string | null;
    imdb_votes: number | null;
  }> | null;
};

export type CinemaDailyCandidateRuntimeSummary = {
  mode: "read_only_movie_city_candidates";
  persistence: "none";
  publication_authorized: false;
  as_of: string;
  city_id: string | null;
  screening_rows: number;
  candidate_count: number;
  candidates: CinemaDailyMovieCityCandidate[];
};

const singleRelation = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? value[0] ?? null : value;

const numberOrNull = (value: number | string | null) => {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const stringList = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
  : [];

const localDate = (startsAt: string, timezone: string) => {
  const instant = new Date(startsAt);
  if (!Number.isFinite(instant.getTime())) throw new Error("cinema_candidate_runtime_starts_at_invalid");
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
  } catch {
    throw new Error("cinema_candidate_runtime_timezone_invalid");
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) throw new Error("cinema_candidate_runtime_local_date_invalid");
  return `${values.year}-${values.month}-${values.day}`;
};

const toCandidateScreening = (row: CinemaDailyCandidateDbRow): CinemaDailyCandidateScreening => {
  const venue = singleRelation(row.cinema_venues);
  const movie = singleRelation(row.cinema_movies);
  if (!venue || !movie) throw new Error("cinema_candidate_runtime_relation_missing");
  return {
    movie_id: row.movie_id,
    city_id: venue.city_id,
    city_name: venue.city_name,
    venue_id: row.cinema_id,
    cinema_name: venue.name,
    title: movie.title,
    local_date: localDate(row.starts_at, venue.timezone),
    format: row.format,
    audio_type: row.audio_type,
    version_type: row.version_type,
    screening_tags: stringList(row.screening_tags),
    release_year: movie.release_year,
    imdb_rating: numberOrNull(movie.imdb_rating),
    imdb_votes: movie.imdb_votes,
    active: row.status === "scheduled" && venue.active,
  };
};

export async function loadDailyMovieCityCandidates(options: {
  db: SupabaseClient;
  now?: Date;
  cityId?: string;
  pageSize?: number;
}): Promise<CinemaDailyCandidateRuntimeSummary> {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("cinema_candidate_runtime_now_invalid");
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 1_000, 1_000));
  const rows: CinemaDailyCandidateDbRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    let query = options.db.from("cinema_screenings")
      .select("id,movie_id,cinema_id,starts_at,format,audio_type,version_type,screening_tags,status,cinema_venues!inner(city_id,city_name,name,timezone,active),cinema_movies!inner(title,release_year,imdb_rating,imdb_votes)")
      .eq("status", "scheduled")
      .eq("cinema_venues.active", true)
      .gte("starts_at", now.toISOString())
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true });
    if (options.cityId) query = query.eq("cinema_venues.city_id", options.cityId);

    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw new Error(`cinema_daily_candidate_load_failed:${error.code || "unknown"}`);
    const page = (data || []) as unknown as CinemaDailyCandidateDbRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const screenings = rows.map(toCandidateScreening);
  const candidates = buildDailyMovieCityCandidates(screenings);
  return {
    mode: "read_only_movie_city_candidates",
    persistence: "none",
    publication_authorized: false,
    as_of: now.toISOString(),
    city_id: options.cityId ?? null,
    screening_rows: screenings.length,
    candidate_count: candidates.length,
    candidates,
  };
}
