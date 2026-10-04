import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CINEMA_CAPITAL_LOCALIZATION_TARGETS,
  type CinemaCapitalLocale,
} from "./cinema-capital-localization-search.js";

export type CinemaLocalizationReadinessStatus =
  | "matched"
  | "not_found"
  | "mismatch"
  | "ambiguous"
  | "provider_error"
  | "missing";

export type CinemaLocalizationReadinessRow = {
  candidate_id: string;
  movie_id: string;
  rank: number;
  locale: CinemaCapitalLocale;
  status: CinemaLocalizationReadinessStatus;
};

export type CinemaLocalizationCandidateReadiness = {
  candidate_id: string;
  movie_id: string;
  rank: number;
  ready: boolean;
  matched_locale_count: number;
  required_locale_count: number;
  locales: Record<CinemaCapitalLocale, CinemaLocalizationReadinessStatus>;
  blockers: CinemaCapitalLocale[];
};

export type CinemaWeeklyLocalizationReadinessSummary = {
  mode: "weekly_localization_readiness";
  weekly_selection_id: string;
  publication_authorized: false;
  required_locale_count: number;
  candidate_count: number;
  ready_candidate_count: number;
  all_ready: boolean;
  candidates: CinemaLocalizationCandidateReadiness[];
};

const localeOrder = CINEMA_CAPITAL_LOCALIZATION_TARGETS.map((target) => target.locale);

const emptyLocales = (): Record<CinemaCapitalLocale, CinemaLocalizationReadinessStatus> =>
  Object.fromEntries(localeOrder.map((locale) => [locale, "missing"])) as Record<
    CinemaCapitalLocale,
    CinemaLocalizationReadinessStatus
  >;

export function evaluateCinemaWeeklyLocalizationReadiness(options: {
  weeklySelectionId: string;
  candidates: Array<{ candidate_id: string; movie_id: string; rank: number }>;
  results: Array<{ candidate_id: string; movie_id: string; locale: string; status: string }>;
}): CinemaWeeklyLocalizationReadinessSummary {
  const weeklySelectionId = options.weeklySelectionId.trim();
  if (!weeklySelectionId) throw new Error("cinema_localization_readiness_selection_invalid");

  const byCandidate = new Map<string, CinemaLocalizationCandidateReadiness>();
  for (const candidate of [...options.candidates].sort((a, b) => a.rank - b.rank || a.candidate_id.localeCompare(b.candidate_id))) {
    if (!candidate.candidate_id || !candidate.movie_id || !Number.isInteger(candidate.rank) || candidate.rank < 1 || candidate.rank > 10) {
      throw new Error("cinema_localization_readiness_candidate_invalid");
    }
    if (byCandidate.has(candidate.candidate_id)) {
      throw new Error("cinema_localization_readiness_candidate_duplicate");
    }
    byCandidate.set(candidate.candidate_id, {
      candidate_id: candidate.candidate_id,
      movie_id: candidate.movie_id,
      rank: candidate.rank,
      ready: false,
      matched_locale_count: 0,
      required_locale_count: localeOrder.length,
      locales: emptyLocales(),
      blockers: [...localeOrder],
    });
  }

  for (const result of options.results) {
    const candidate = byCandidate.get(result.candidate_id);
    if (!candidate || candidate.movie_id !== result.movie_id) {
      throw new Error("cinema_localization_readiness_result_identity_mismatch");
    }
    if (!localeOrder.includes(result.locale as CinemaCapitalLocale)) {
      throw new Error("cinema_localization_readiness_locale_invalid");
    }
    if (!["matched", "not_found", "mismatch", "ambiguous", "provider_error"].includes(result.status)) {
      throw new Error("cinema_localization_readiness_status_invalid");
    }
    const locale = result.locale as CinemaCapitalLocale;
    if (candidate.locales[locale] !== "missing") {
      throw new Error("cinema_localization_readiness_result_duplicate");
    }
    candidate.locales[locale] = result.status as Exclude<CinemaLocalizationReadinessStatus, "missing">;
  }

  const candidates = [...byCandidate.values()].map((candidate) => {
    const blockers = localeOrder.filter((locale) => candidate.locales[locale] !== "matched");
    return {
      ...candidate,
      ready: blockers.length === 0,
      matched_locale_count: localeOrder.length - blockers.length,
      blockers,
    };
  });

  return {
    mode: "weekly_localization_readiness",
    weekly_selection_id: weeklySelectionId,
    publication_authorized: false,
    required_locale_count: localeOrder.length,
    candidate_count: candidates.length,
    ready_candidate_count: candidates.filter((candidate) => candidate.ready).length,
    all_ready: candidates.length > 0 && candidates.every((candidate) => candidate.ready),
    candidates,
  };
}

export async function loadCinemaWeeklyLocalizationReadiness(options: {
  db: SupabaseClient;
  weeklySelectionId: string;
}): Promise<CinemaWeeklyLocalizationReadinessSummary> {
  const weeklySelectionId = options.weeklySelectionId.trim();
  if (!weeklySelectionId) throw new Error("cinema_localization_readiness_selection_invalid");

  const { data: selection, error: selectionError } = await options.db
    .from("cinema_weekly_publication_selections")
    .select("id,state,top_limit,locked_at")
    .eq("id", weeklySelectionId)
    .single();

  if (selectionError || !selection) {
    throw new Error(`cinema_localization_readiness_selection_load_failed:${selectionError?.code || "not_found"}`);
  }
  if (!["ranked", "enriching"].includes(String(selection.state)) || !selection.locked_at) {
    throw new Error("cinema_localization_readiness_selection_not_locked");
  }

  const { data: candidateRows, error: candidateError } = await options.db
    .from("cinema_weekly_publication_candidates")
    .select("candidate_id,movie_id,rank,publication_authorized")
    .eq("weekly_selection_id", weeklySelectionId)
    .lte("rank", Number(selection.top_limit))
    .order("rank", { ascending: true });

  if (candidateError) {
    throw new Error(`cinema_localization_readiness_candidates_load_failed:${candidateError.code || "unknown"}`);
  }

  const candidates = candidateRows || [];
  if (candidates.some((candidate) => candidate.publication_authorized === true)) {
    throw new Error("cinema_localization_readiness_candidate_already_authorized");
  }

  const { data: resultRows, error: resultError } = await options.db
    .from("cinema_weekly_localization_search_results")
    .select("candidate_id,movie_id,locale,status")
    .eq("weekly_selection_id", weeklySelectionId)
    .order("candidate_id", { ascending: true })
    .order("locale", { ascending: true });

  if (resultError) {
    throw new Error(`cinema_localization_readiness_results_load_failed:${resultError.code || "unknown"}`);
  }

  return evaluateCinemaWeeklyLocalizationReadiness({
    weeklySelectionId,
    candidates: candidates.map((candidate) => ({
      candidate_id: String(candidate.candidate_id),
      movie_id: String(candidate.movie_id),
      rank: Number(candidate.rank),
    })),
    results: (resultRows || []).map((row) => ({
      candidate_id: String(row.candidate_id),
      movie_id: String(row.movie_id),
      locale: String(row.locale),
      status: String(row.status),
    })),
  });
}
