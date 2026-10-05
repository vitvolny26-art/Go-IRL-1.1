import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrichCinemaMovieFromTmdb,
  type CinemaMovieEnrichmentRow,
} from "./cinema-movie-enrichment.js";

export type CinemaWeeklyImdbOutcomeStatus =
  | "matched"
  | "not_found"
  | "mismatch"
  | "ambiguous"
  | "provider_error";

export type CinemaWeeklyImdbCandidate = {
  source_candidate_id: string;
  movie_id: string;
  rank: number;
  score: number;
  title: string;
  showing_from: string;
  showing_until: string;
};

export type CinemaWeeklyImdbOutcome = {
  source_candidate_id: string;
  movie_id: string;
  rank: number;
  status: CinemaWeeklyImdbOutcomeStatus;
  imdb_id: string | null;
  tmdb_id: number | null;
  match_basis: "existing_imdb" | "tmdb_identity" | null;
};

export type CinemaWeeklyVerifiedTop10Summary = {
  mode: "weekly_imdb_top25_verified_top10";
  city_id: string;
  week_start: string;
  week_end: string;
  input_candidate_count: number;
  imdb_matched_count: number;
  imdb_not_found_count: number;
  imdb_mismatch_count: number;
  imdb_ambiguous_count: number;
  provider_error_count: number;
  verified_top10_count: number;
  ready: boolean;
  publication_authorized: false;
  outcomes: CinemaWeeklyImdbOutcome[];
  verified_top10: CinemaWeeklyImdbOutcome[];
};

const validImdbId = (value: unknown) => /^tt\d{7,10}$/.test(String(value || "").trim());

export function rankCinemaWeeklyTop25(rows: Array<{
  id: string;
  movie_id: string;
  score: number;
  title: string;
  showing_from: string;
  showing_until: string;
}>): CinemaWeeklyImdbCandidate[] {
  const sorted = [...rows].sort((left, right) =>
    right.score - left.score
    || left.showing_from.localeCompare(right.showing_from)
    || right.showing_until.localeCompare(left.showing_until)
    || left.id.localeCompare(right.id));

  const seenMovies = new Set<string>();
  const output: CinemaWeeklyImdbCandidate[] = [];
  for (const row of sorted) {
    if (seenMovies.has(row.movie_id)) continue;
    seenMovies.add(row.movie_id);
    output.push({
      source_candidate_id: row.id,
      movie_id: row.movie_id,
      rank: output.length + 1,
      score: row.score,
      title: row.title,
      showing_from: row.showing_from,
      showing_until: row.showing_until,
    });
    if (output.length === 25) break;
  }
  return output;
}

export async function runCinemaWeeklyImdbTop25(options: {
  db: SupabaseClient;
  cityId: string;
  weekStart: string;
  weekEnd: string;
}): Promise<CinemaWeeklyVerifiedTop10Summary> {
  const cityId = options.cityId.trim();
  if (!cityId || cityId.length > 80) throw new Error("cinema_weekly_imdb_city_invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(options.weekEnd)) {
    throw new Error("cinema_weekly_imdb_window_invalid");
  }

  const { data: dailyRows, error: dailyError } = await options.db
    .from("cinema_daily_movie_city_candidates")
    .select("id,movie_id,score,title,showing_from,showing_until,lifecycle_status")
    .eq("city_id", cityId)
    .eq("lifecycle_status", "active")
    .lte("showing_from", options.weekEnd)
    .gte("showing_until", options.weekStart)
    .order("score", { ascending: false })
    .order("showing_from", { ascending: true })
    .order("showing_until", { ascending: false })
    .order("id", { ascending: true })
    .limit(1000);

  if (dailyError) throw new Error(`cinema_weekly_imdb_candidates_load_failed:${dailyError.code || "unknown"}`);

  const ranked = rankCinemaWeeklyTop25((dailyRows || []).map((row) => ({
    id: String(row.id),
    movie_id: String(row.movie_id),
    score: Number(row.score),
    title: String(row.title),
    showing_from: String(row.showing_from),
    showing_until: String(row.showing_until),
  })));

  const movieIds = ranked.map((candidate) => candidate.movie_id);
  if (!movieIds.length) {
    return {
      mode: "weekly_imdb_top25_verified_top10",
      city_id: cityId,
      week_start: options.weekStart,
      week_end: options.weekEnd,
      input_candidate_count: 0,
      imdb_matched_count: 0,
      imdb_not_found_count: 0,
      imdb_mismatch_count: 0,
      imdb_ambiguous_count: 0,
      provider_error_count: 0,
      verified_top10_count: 0,
      ready: false,
      publication_authorized: false,
      outcomes: [],
      verified_top10: [],
    };
  }

  const { data: movieRows, error: movieError } = await options.db
    .from("cinema_movies")
    .select("id,title,original_title,release_year,duration_minutes,genres,countries,original_language,age_rating,imdb_id,rating_status,poster_url,poster_source,synopsis_source,synopsis_generated,director,lead_actors,external_ids")
    .in("id", movieIds);

  if (movieError) throw new Error(`cinema_weekly_imdb_movies_load_failed:${movieError.code || "unknown"}`);
  const byMovie = new Map((movieRows || []).map((movie) => [String(movie.id), movie as CinemaMovieEnrichmentRow]));

  const outcomes: CinemaWeeklyImdbOutcome[] = [];
  for (const candidate of ranked) {
    const movie = byMovie.get(candidate.movie_id);
    if (!movie) throw new Error("cinema_weekly_imdb_movie_missing");

    if (validImdbId(movie.imdb_id)) {
      const externalIds = movie.external_ids && typeof movie.external_ids === "object" && !Array.isArray(movie.external_ids)
        ? movie.external_ids as Record<string, unknown>
        : {};
      outcomes.push({
        source_candidate_id: candidate.source_candidate_id,
        movie_id: candidate.movie_id,
        rank: candidate.rank,
        status: "matched",
        imdb_id: String(movie.imdb_id),
        tmdb_id: Number(externalIds.tmdb || 0) || null,
        match_basis: "existing_imdb",
      });
      continue;
    }

    const result = await enrichCinemaMovieFromTmdb(movie);
    if (result.status !== "matched") {
      outcomes.push({
        source_candidate_id: candidate.source_candidate_id,
        movie_id: candidate.movie_id,
        rank: candidate.rank,
        status: result.status === "unavailable" || result.status === "not_configured" ? "not_found" : result.status,
        imdb_id: null,
        tmdb_id: null,
        match_basis: null,
      });
      continue;
    }

    const imdbId = typeof result.update.imdb_id === "string" ? result.update.imdb_id.trim() : "";
    if (!validImdbId(imdbId)) {
      outcomes.push({
        source_candidate_id: candidate.source_candidate_id,
        movie_id: candidate.movie_id,
        rank: candidate.rank,
        status: "not_found",
        imdb_id: null,
        tmdb_id: result.tmdbId,
        match_basis: null,
      });
      continue;
    }

    const { error: updateError } = await options.db
      .from("cinema_movies")
      .update(result.update)
      .eq("id", candidate.movie_id)
      .is("imdb_id", null);
    if (updateError) throw new Error(`cinema_weekly_imdb_update_failed:${updateError.code || "unknown"}`);

    outcomes.push({
      source_candidate_id: candidate.source_candidate_id,
      movie_id: candidate.movie_id,
      rank: candidate.rank,
      status: "matched",
      imdb_id: imdbId,
      tmdb_id: result.tmdbId,
      match_basis: "tmdb_identity",
    });
  }

  const verifiedTop10 = outcomes
    .filter((row) => row.status === "matched" && validImdbId(row.imdb_id))
    .slice(0, 10);
  const count = (status: CinemaWeeklyImdbOutcomeStatus) => outcomes.filter((row) => row.status === status).length;

  return {
    mode: "weekly_imdb_top25_verified_top10",
    city_id: cityId,
    week_start: options.weekStart,
    week_end: options.weekEnd,
    input_candidate_count: ranked.length,
    imdb_matched_count: count("matched"),
    imdb_not_found_count: count("not_found"),
    imdb_mismatch_count: count("mismatch"),
    imdb_ambiguous_count: count("ambiguous"),
    provider_error_count: count("provider_error"),
    verified_top10_count: verifiedTop10.length,
    ready: verifiedTop10.length === 10,
    publication_authorized: false,
    outcomes,
    verified_top10: verifiedTop10,
  };
}
