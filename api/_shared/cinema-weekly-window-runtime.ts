import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeNextCinemaWeeklyWindow,
  filterCinemaWeeklyWindowCandidates,
  type CinemaWeeklyWindowCandidate,
} from "./cinema-weekly-window.js";

export type CinemaWeeklyWindowRuntimeSummary = {
  mode: "weekly_window";
  publication_authorized: false;
  ranking_locked: false;
  city_id: string;
  timezone: "Europe/Prague";
  week_start: string;
  week_end: string;
  eligible_candidate_count: number;
  candidates: CinemaWeeklyWindowCandidate[];
};

export async function loadCinemaWeeklyWindow(options: {
  db: SupabaseClient;
  cityId: string;
  now?: Date;
  pageSize?: number;
}): Promise<CinemaWeeklyWindowRuntimeSummary> {
  const cityId = options.cityId.trim();
  if (!cityId || cityId.length > 80) throw new Error("cinema_weekly_window_city_invalid");

  const window = computeNextCinemaWeeklyWindow(options.now);
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 1_000, 1_000));
  const rows: CinemaWeeklyWindowCandidate[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await options.db
      .from("cinema_daily_movie_city_candidates")
      .select("id,movie_id,city_id,city_name,title,showing_from,showing_until,score,priority,lifecycle_status")
      .eq("city_id", cityId)
      .eq("lifecycle_status", "active")
      .lte("showing_from", window.week_end)
      .gte("showing_until", window.week_start)
      .order("showing_from", { ascending: true })
      .order("showing_until", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`cinema_weekly_window_load_failed:${error.code || "unknown"}`);
    const page = (data || []) as CinemaWeeklyWindowCandidate[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const candidates = filterCinemaWeeklyWindowCandidates(rows, window, cityId);

  return {
    mode: "weekly_window",
    publication_authorized: false,
    ranking_locked: false,
    city_id: cityId,
    timezone: window.timezone,
    week_start: window.week_start,
    week_end: window.week_end,
    eligible_candidate_count: candidates.length,
    candidates,
  };
}

export async function ensureCinemaWeeklyWindowSelection(options: {
  db: SupabaseClient;
  cityId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const cityId = options.cityId.trim();
  if (!cityId || cityId.length > 80) throw new Error("cinema_weekly_window_city_invalid");

  const { data, error } = await options.db.rpc("cinema_get_or_create_weekly_publication_selection", {
    p_city_id: cityId,
    p_week_start: options.weekStart,
    p_week_end: options.weekEnd,
  });

  if (error) throw new Error(`cinema_weekly_window_persist_failed:${error.code || "unknown"}`);
  if (typeof data !== "string" || !data) throw new Error("cinema_weekly_window_selection_missing");
  return data;
}
