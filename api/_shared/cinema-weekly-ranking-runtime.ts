import type { SupabaseClient } from "@supabase/supabase-js";

export type CinemaWeeklyRankingLockSummary = {
  weekly_selection_id: string;
  state: "ranked";
  locked_at: string;
  top_limit: number;
  candidate_count: number;
  publication_authorized: false;
};

export async function lockCinemaWeeklyTopCandidates(options: {
  db: SupabaseClient;
  weeklySelectionId: string;
}): Promise<CinemaWeeklyRankingLockSummary> {
  const weeklySelectionId = options.weeklySelectionId.trim();
  if (!weeklySelectionId) throw new Error("cinema_weekly_ranking_selection_invalid");

  const { data, error } = await options.db.rpc("cinema_lock_weekly_publication_ranking", {
    p_weekly_selection_id: weeklySelectionId,
  });

  if (error) throw new Error(`cinema_weekly_ranking_lock_failed:${error.code || "unknown"}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("cinema_weekly_ranking_lock_result_invalid");
  }

  const result = data as Record<string, unknown>;
  if (
    result.weekly_selection_id !== weeklySelectionId
    || result.state !== "ranked"
    || typeof result.locked_at !== "string"
    || !Number.isInteger(result.top_limit)
    || !Number.isInteger(result.candidate_count)
    || result.publication_authorized !== false
  ) {
    throw new Error("cinema_weekly_ranking_lock_result_invalid");
  }

  return result as unknown as CinemaWeeklyRankingLockSummary;
}
