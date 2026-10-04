import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CINEMA_CAPITAL_LOCALIZATION_TARGETS,
  buildCinemaCapitalLocalizationSearchRow,
  type CinemaCapitalLocalizationTarget,
  type CinemaLocalizationCanonicalMovie,
  type CinemaLocalizationMatchResult,
} from "./cinema-capital-localization-search.js";

export type CinemaCapitalLocalizationWorkItem = {
  weekly_selection_id: string;
  candidate_id: string;
  movie_id: string;
  rank: number;
  movie: CinemaLocalizationCanonicalMovie;
  targets: readonly CinemaCapitalLocalizationTarget[];
};

export async function loadCinemaCapitalLocalizationInventory(options: {
  db: SupabaseClient;
  weeklySelectionId: string;
}): Promise<CinemaCapitalLocalizationWorkItem[]> {
  const weeklySelectionId = options.weeklySelectionId.trim();
  if (!weeklySelectionId) throw new Error("cinema_capital_localization_selection_invalid");

  const { data: selection, error: selectionError } = await options.db
    .from("cinema_weekly_publication_selections")
    .select("id,state,top_limit,locked_at")
    .eq("id", weeklySelectionId)
    .single();

  if (selectionError || !selection) {
    throw new Error(`cinema_capital_localization_selection_load_failed:${selectionError?.code || "not_found"}`);
  }
  if (!["ranked", "enriching"].includes(String(selection.state)) || !selection.locked_at) {
    throw new Error("cinema_capital_localization_selection_not_locked");
  }

  const { data: candidates, error: candidateError } = await options.db
    .from("cinema_weekly_publication_candidates")
    .select("weekly_selection_id,candidate_id,movie_id,rank,publication_authorized")
    .eq("weekly_selection_id", weeklySelectionId)
    .lte("rank", Number(selection.top_limit))
    .order("rank", { ascending: true });

  if (candidateError) {
    throw new Error(`cinema_capital_localization_candidates_load_failed:${candidateError.code || "unknown"}`);
  }

  const ranked = candidates || [];
  if (ranked.some((candidate) => candidate.publication_authorized === true)) {
    throw new Error("cinema_capital_localization_candidate_already_authorized");
  }

  const movieIds = [...new Set(ranked.map((candidate) => String(candidate.movie_id)))];
  if (!movieIds.length) return [];

  const { data: movies, error: movieError } = await options.db
    .from("cinema_movies")
    .select("id,title,original_title,release_year,duration_minutes,imdb_id,external_ids")
    .in("id", movieIds);

  if (movieError) {
    throw new Error(`cinema_capital_localization_movies_load_failed:${movieError.code || "unknown"}`);
  }

  const movieById = new Map((movies || []).map((movie) => [String(movie.id), movie as CinemaLocalizationCanonicalMovie]));
  return ranked.map((candidate) => {
    const movie = movieById.get(String(candidate.movie_id));
    if (!movie) throw new Error("cinema_capital_localization_movie_missing");
    return {
      weekly_selection_id: weeklySelectionId,
      candidate_id: String(candidate.candidate_id),
      movie_id: String(candidate.movie_id),
      rank: Number(candidate.rank),
      movie,
      targets: CINEMA_CAPITAL_LOCALIZATION_TARGETS,
    };
  });
}

export async function persistCinemaCapitalLocalizationSearchResult(options: {
  db: SupabaseClient;
  weeklySelectionId: string;
  candidateId: string;
  movieId: string;
  target: CinemaCapitalLocalizationTarget;
  result: CinemaLocalizationMatchResult | { status: "provider_error"; candidate_ids?: string[] };
}) {
  const row = buildCinemaCapitalLocalizationSearchRow(options);
  const { error } = await options.db
    .from("cinema_weekly_localization_search_results")
    .upsert(row, { onConflict: "weekly_selection_id,candidate_id,locale" });

  if (error) throw new Error(`cinema_capital_localization_persist_failed:${error.code || "unknown"}`);
  return row;
}
