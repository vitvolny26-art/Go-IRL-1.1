/** Kino000(SR) — server readback evidence -> exactly one Top7 review target.
 * No writer, claim, publication, Telegram, or automatic release capability.
 */
import { evaluateSrHandoff, type SrHandoff } from "./cinema-sr-publication-preflight.js";
import { prepareSrPolicyHandoff } from "./cinema-sr-policy-handoff.js";
import { validateSrAttemptJournal } from "./cinema-sr-publication-attempt-journal.js";
import { planSrTop7NextReview, type SrTop7Attempt, type SrTop7SequencePlan } from "./cinema-sr-top7-sequence.js";
import { validateSrSequenceScope, type SrSequenceScope, type SrCountedRows } from "./cinema-sr-sequence-readback.js";

export type SrPreviewMovie = {
  id: string; city_id: string; selection_week_start: string; selection_week_end: string;
  rank: number; source_movie_key: string; poster_url: string | null;
  translations: unknown; readiness: unknown; publication_state: string;
};
export type SrPreviewScreening = {
  catalog_movie_id: string; source_screening_key: string; cinema_key: string;
  venue_timezone: string; starts_at: string; source_id: string | null; source_url: string | null;
};
export type SrPreviewPort = {
  movies(scope: SrSequenceScope): Promise<SrCountedRows<SrPreviewMovie>>;
  screenings(movieIds: readonly string[]): Promise<SrCountedRows<SrPreviewScreening>>;
  attempts(scope: SrSequenceScope): Promise<SrCountedRows<unknown>>;
};
const uuid = (v: unknown): v is string => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const complete = <T>(r: SrCountedRows<T>, limit: number) =>
  !r.error && Array.isArray(r.data) && Number.isSafeInteger(r.count) &&
  r.count! >= 0 && r.count! <= limit && r.count === r.data.length;
const blocked = (reason: string): SrTop7SequencePlan => ({
  status: "SR_TOP7_SEQUENCE_REVIEW_ONLY", sequence_state: "blocked",
  next_catalog_movie_id: null, next_rank: null, confirmed_prior_ranks: [],
  blockers: [reason], action: "none", release_enabled: false,
  publication_authorized: false, telegram_send_authorized: false,
  next_review_is_not_publication_authorization: true,
});
const localDay = (row: SrPreviewScreening): string | null => {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(row.starts_at) ||
      !Number.isFinite(Date.parse(row.starts_at))) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: row.venue_timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(row.starts_at));
    const fields = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  } catch { return null; }
};

/**
 * Read-only / fail-closed. For a previously succeeded attempt the existing
 * schema cannot prove the provider result was NOT reused. It MUST block
 * instead of treating catalog/Telegram ledger presence as that proof.
 */
export async function readSrTop7NextReview(port: SrPreviewPort, rawScope: unknown): Promise<SrTop7SequencePlan> {
  let scope: SrSequenceScope;
  try { scope = validateSrSequenceScope(rawScope); }
  catch { return blocked("top7_scope_invalid"); }
  try {
    const movies = await port.movies(scope);
    if (!complete(movies, 7) || movies.count !== 7) return blocked("top7_exact_movie_readback_required");
    const ids = new Set<string>(), ranks = new Set<number>(), candidates = new Set<string>();
    const [start, end] = scope.week_key.split("..");
    for (const movie of movies.data!) {
      if (!uuid(movie.id) || ids.has(movie.id) || !Number.isInteger(movie.rank) ||
          movie.rank < 1 || movie.rank > 7 || ranks.has(movie.rank) ||
          typeof movie.source_movie_key !== "string" || !movie.source_movie_key.trim() ||
          candidates.has(movie.source_movie_key) || movie.city_id !== "olomouc" ||
          movie.selection_week_start !== start || movie.selection_week_end !== end) {
        return blocked("top7_movie_identity_invalid");
      }
      // A catalog already marked published without a matching durable journal
      // cannot be treated as a never-attempted new review target.
      if (!["ready", "proposed", "approved"].includes(movie.publication_state)) {
        return blocked("top7_catalog_state_requires_attempt_reconciliation");
      }
      ids.add(movie.id); ranks.add(movie.rank); candidates.add(movie.source_movie_key);
    }
    const screenings = await port.screenings([...ids]);
    if (!complete(screenings, 7000)) return blocked("top7_screenings_readback_incomplete");
    const byMovie = new Map<string, SrPreviewScreening[]>();
    const seenKeys = new Set<string>();
    for (const s of screenings.data!) {
      if (!ids.has(s.catalog_movie_id) || !s.source_screening_key || seenKeys.has(s.source_screening_key))
        return blocked("top7_screening_identity_invalid");
      seenKeys.add(s.source_screening_key);
      if (!byMovie.has(s.catalog_movie_id)) byMovie.set(s.catalog_movie_id, []);
      byMovie.get(s.catalog_movie_id)!.push(s);
    }
    const policies = [];
    for (const movie of movies.data!.slice().sort((a, b) => a.rank - b.rank)) {
      const rows = byMovie.get(movie.id) || [];
      const dates = rows.map(localDay);
      if (!rows.length || dates.some(d => d === null)) return blocked("top7_screening_dates_unverified");
      const ordered = (dates as string[]).sort();
      const handoff: SrHandoff = {
        catalog_movie_id: movie.id, week_key: scope.week_key, run_id: scope.source_run_id,
        candidate_id: movie.source_movie_key, rank: movie.rank, mode: "top7_automatic_target",
        screening_count: rows.length, showing_from: ordered[0], showing_until: ordered[ordered.length - 1],
        release_enabled: false,
      };
      const preflight = evaluateSrHandoff(handoff, movie, rows);
      policies.push(prepareSrPolicyHandoff(handoff, preflight));
    }
    const journal = await port.attempts(scope);
    if (!complete(journal, 7)) return blocked("top7_attempt_journal_incomplete");
    let validated;
    try { validated = validateSrAttemptJournal(journal.data!, scope); }
    catch { return blocked("top7_attempt_journal_invalid"); }
    const mapped: SrTop7Attempt[] = validated.map(attempt => ({
      catalog_movie_id: attempt.catalog_movie_id, candidate_id: attempt.candidate_key,
      week_key: attempt.week_key, source_run_id: attempt.source_run_id, rank: attempt.rank,
      status: attempt.status === "started" ? "in_progress" : attempt.status,
      event_id: attempt.catalog_event_id,
      // No verified independent provider non-reuse evidence exists yet.
      catalog_published_event_id: null, telegram_published_event_id: null,
      telegram_result_reused: true, telegram_message_id: attempt.telegram_message_id,
      telegram_delivery_readback_verified: false,
      catalog_published_readback_verified: false,
      event_published_readback_verified: false,
    }));
    const result = planSrTop7NextReview(policies, mapped);
    return result.sequence_state === "blocked" && validated.some(a => a.status === "succeeded") &&
      result.blockers.includes("top7_prior_delivery_readback_incomplete")
      ? blocked("top7_independent_provider_nonreuse_proof_missing") : result;
  } catch { return blocked("top7_server_readback_unavailable"); }
}
