import type { SupabaseClient } from "@supabase/supabase-js";
import type { CinemaDailyMovieCityCandidate } from "./cinema-daily-candidates.js";

type PersistedCandidateRow = {
  candidate_id: string;
  movie_id: string;
  city_id: string;
  showing_from: string;
  showing_until: string;
  lifecycle_status: "active" | "superseded";
  decision_status: "pending" | "approved" | "rejected";
};

export type CinemaDailyCandidatePersistenceSummary = {
  mode: "movie_city_candidate_persistence";
  persistence: "cinema_daily_movie_city_candidates";
  publication_authorized: false;
  owner_decision_required: true;
  city_id: string;
  observed_at: string;
  candidate_count: number;
  persisted_count: number;
  candidates: PersistedCandidateRow[];
};

const validCityId = (value: string) => /^[a-z0-9_-]{1,80}$/.test(value);

export async function persistDailyMovieCityCandidates(options: {
  db: SupabaseClient;
  cityId: string;
  candidates: CinemaDailyMovieCityCandidate[];
  observedAt?: Date;
}): Promise<CinemaDailyCandidatePersistenceSummary> {
  const cityId = options.cityId.trim();
  if (!validCityId(cityId)) throw new Error("cinema_candidate_city_invalid");
  if (options.candidates.some((candidate) => candidate.city_id !== cityId)) {
    throw new Error("cinema_candidate_city_mismatch");
  }

  const movieIds = new Set<string>();
  for (const candidate of options.candidates) {
    if (movieIds.has(candidate.movie_id)) throw new Error("cinema_candidate_duplicate_movie_city");
    movieIds.add(candidate.movie_id);
  }

  const observedAt = options.observedAt ?? new Date();
  if (!Number.isFinite(observedAt.getTime())) throw new Error("cinema_candidate_observed_at_invalid");

  const payload = options.candidates.map((candidate) => ({
    movie_id: candidate.movie_id,
    city_id: candidate.city_id,
    city_name: candidate.city_name,
    title: candidate.title,
    showing_from: candidate.showing_from,
    showing_until: candidate.showing_until,
    screening_count: candidate.screening_count,
    day_count: candidate.day_count,
    cinemas: candidate.cinemas,
    venue_ids: candidate.venue_ids,
    formats: candidate.formats,
    audio_types: candidate.audio_types,
    version_types: candidate.version_types,
    score: candidate.score,
    priority: candidate.priority,
    reasons: candidate.reasons,
  }));

  const { data, error } = await options.db.rpc("cinema_persist_daily_movie_city_candidates", {
    p_city_id: cityId,
    p_candidates: payload,
    p_observed_at: observedAt.toISOString(),
  });
  if (error) throw new Error(`cinema_daily_candidate_persist_failed:${error.code || "unknown"}`);

  const persisted = (data || []) as PersistedCandidateRow[];
  if (persisted.length !== payload.length) {
    throw new Error("cinema_daily_candidate_persist_count_mismatch");
  }

  return {
    mode: "movie_city_candidate_persistence",
    persistence: "cinema_daily_movie_city_candidates",
    publication_authorized: false,
    owner_decision_required: true,
    city_id: cityId,
    observed_at: observedAt.toISOString(),
    candidate_count: payload.length,
    persisted_count: persisted.length,
    candidates: persisted,
  };
}
