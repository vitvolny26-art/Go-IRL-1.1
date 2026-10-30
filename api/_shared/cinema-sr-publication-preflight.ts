/** Kino000(SR): evidence-only handoff. This module MUST NOT authorize publication. */
export type SrMode = "top7_automatic_target" | "top8_10_telegram_request_only";
export type SrHandoff = {
  catalog_movie_id: string;
  week_key: string;
  run_id: string;
  candidate_id: string;
  rank: number;
  mode: SrMode;
  screening_count: number;
  showing_from: string;
  showing_until: string;
  release_enabled: false;
};

type Movie = {
  id: string;
  city_id: string;
  selection_week_start: string;
  selection_week_end: string;
  rank: number;
  source_movie_key: string;
  poster_url: string | null;
  translations: unknown;
  readiness: unknown;
  publication_state: string;
};
type Screening = {
  catalog_movie_id: string;
  source_screening_key: string;
  cinema_key: string;
  venue_timezone: string;
  starts_at: string;
  source_id: string | null;
  source_url: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
const LANGUAGES = ["ru", "uk", "cs", "en", "pl", "sk"] as const;
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const validDate = (value: string) => DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const https = (value: unknown) => {
  try {
    const u = new URL(str(value));
    return u.protocol === "https:" && Boolean(u.hostname);
  } catch { return false; }
};
const TIMESTAMP_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const localDate = (iso: string, timezone: string) => {
  if (typeof iso !== "string" || !TIMESTAMP_WITH_OFFSET.test(iso) || !Number.isFinite(Date.parse(iso))) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(iso));
    const m = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${m.year}-${m.month}-${m.day}`;
  } catch { return null; }
};

/** Strictly ONE n8n handoff, with no batch or action flags. */
export function validateSrHandoff(raw: unknown): SrHandoff {
  const input = obj(raw);
  const allowed = new Set([
    "catalog_movie_id", "week_key", "run_id", "candidate_id", "rank", "mode",
    "screening_count", "showing_from", "showing_until", "release_enabled",
  ]);
  if (!raw || Array.isArray(raw) || Object.keys(input).some(k => !allowed.has(k))) {
    throw new Error("cinema_sr_handoff_invalid_shape");
  }
  if (!UUID.test(str(input.catalog_movie_id))) throw new Error("cinema_sr_catalog_uuid_missing_or_invalid");
  const match = WEEK.exec(str(input.week_key));
  if (!match || !validDate(match[1]) || !validDate(match[2]) || match[1] > match[2]) {
    throw new Error("cinema_sr_week_invalid");
  }
  const rank = input.rank;
  const mode = input.mode;
  if (!Number.isSafeInteger(rank) || Number(rank) < 1 || Number(rank) > 10 ||
      (Number(rank) <= 7 ? mode !== "top7_automatic_target" : mode !== "top8_10_telegram_request_only")) {
    throw new Error("cinema_sr_rank_mode_mismatch");
  }
  if (!str(input.run_id) || str(input.run_id).length > 240 || !str(input.candidate_id) || str(input.candidate_id).length > 240) {
    throw new Error("cinema_sr_source_identity_missing");
  }
  if (!Number.isSafeInteger(input.screening_count) || Number(input.screening_count) <= 0 || Number(input.screening_count) > 1000) {
    throw new Error("cinema_sr_screening_count_invalid");
  }
  const from = str(input.showing_from), until = str(input.showing_until);
  if (!validDate(from) || !validDate(until) || from > until) throw new Error("cinema_sr_showing_range_invalid");
  if (input.release_enabled !== false) throw new Error("cinema_sr_release_must_remain_disabled");
  return input as SrHandoff;
}

export type SrPreflight = {
  status: "SR_EVIDENCE_PREFLIGHT_NO_WRITE";
  catalog_movie_id: string;
  rank: number;
  mode: SrMode;
  blockers: string[];
  evidence_complete: boolean;
  publication_authorized: false;
  telegram_send_authorized: false;
  release_enabled: false;
  /** Product policy only. No external publication permission is granted here. */
  policy_route: "top7_automatic_individual" | "top8_10_exact_telegram_request";
  individual_telegram_request_required: boolean;
  /** Must be granted by a future guarded server policy, not by this preflight. */
  exact_movie_server_policy_gate_required: true;
  operator_release_gate_required: true;
};

/** Compare the exact persisted catalog identity and all factual screening dates. */
export function evaluateSrHandoff(input: SrHandoff, movie: Movie, screenings: Screening[]): SrPreflight {
  const blockers: string[] = [];
  const fail = (message: string) => { if (!blockers.includes(message)) blockers.push(message); };
  const week = WEEK.exec(input.week_key)!;
  if (movie.id !== input.catalog_movie_id) fail("catalog_uuid_mismatch");
  if (movie.city_id !== "olomouc") fail("catalog_city_mismatch");
  if (movie.source_movie_key !== input.candidate_id) fail("source_movie_identity_mismatch");
  if (movie.rank !== input.rank) fail("catalog_rank_mismatch");
  if (movie.selection_week_start !== week[1] || movie.selection_week_end !== week[2]) fail("selection_week_mismatch");
  if (!["ready", "proposed", "approved"].includes(movie.publication_state)) fail("catalog_state_not_eligible");
  if (!https(movie.poster_url)) fail("poster_https_missing");

  const readiness = obj(movie.readiness);
  if (readiness.ready !== true) fail("catalog_readiness_missing");
  if (readiness.verified_source_run_id !== input.run_id) fail("source_snapshot_unverified");
  if (readiness.source_identity_verified !== true) fail("identity_provenance_unverified");
  if (readiness.poster_provenance_verified !== true) fail("poster_provenance_unverified");
  if (readiness.screening_horizon_complete !== true) fail("screening_horizon_unverified");
  if (readiness.localizations_provenance_verified !== true) fail("localization_provenance_unverified");

  const translations = obj(movie.translations);
  for (const lang of LANGUAGES) {
    const t = obj(translations[lang]);
    if (!str(t.title) || !str(t.description)) fail(`localization_missing_${lang}`);
  }

  if (screenings.length !== input.screening_count) fail("screening_count_mismatch");
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const s of screenings) {
    if (s.catalog_movie_id !== input.catalog_movie_id) fail("screening_movie_id_mismatch");
    if (!str(s.source_screening_key) || seen.has(s.source_screening_key)) fail("screening_key_invalid_or_duplicate");
    const sourceId = str(s.source_id);
    const screeningKey = str(s.source_screening_key);
    if (!sourceId || !screeningKey.startsWith(`${sourceId}|`) ||
        !str(screeningKey.slice(sourceId.length + 1))) fail("screening_source_identity_mismatch");
    seen.add(s.source_screening_key);
    if (!str(s.cinema_key) || !str(s.source_id) || !https(s.source_url)) fail("screening_source_provenance_missing");
    const date = localDate(s.starts_at, s.venue_timezone);
    if (!date) fail("screening_date_or_timezone_invalid");
    else dates.push(date);
  }
  dates.sort();
  if (!dates.length || dates[0] !== input.showing_from || dates[dates.length - 1] !== input.showing_until) {
    fail("actual_screening_range_mismatch");
  }

  return {
    status: "SR_EVIDENCE_PREFLIGHT_NO_WRITE", catalog_movie_id: input.catalog_movie_id,
    rank: input.rank, mode: input.mode, blockers, evidence_complete: blockers.length === 0,
    publication_authorized: false, telegram_send_authorized: false,
    release_enabled: false,
    policy_route: input.rank <= 7 ? "top7_automatic_individual" : "top8_10_exact_telegram_request",
    individual_telegram_request_required: input.rank >= 8,
    exact_movie_server_policy_gate_required: true,
    operator_release_gate_required: true,
  };
}
