/** Kino000(SR): diagnostic server readback. Never infer absence of attempts from a ledger. */
import { type SrAttemptJournalPort, validateSrAttemptJournal } from "./cinema-sr-publication-attempt-journal.js";
export type SrSequenceScope = { week_key: string; source_run_id: string };
export type SrCatalogReadback = {
  id: string; city_id: string; selection_week_start: string; selection_week_end: string;
  rank: number; source_movie_key: string; readiness: unknown;
  publication_state: string; published_event_id: string | null;
};
export type SrEventReadback = {
  id: string; city_id: string; status: string; published_at: string | null; metadata: unknown;
};
export type SrTelegramReadback = {
  event_id: string; city_id: string; telegram_chat_id: number | string;
  telegram_message_id: number | string; deleted_at: string | null; last_error: string | null;
  published_at: string;
};
export type SrCountedRows<T> = { data: T[] | null; count: number | null; error: unknown };
export type SrSequenceReadPort = SrAttemptJournalPort & {
  catalog(scope: SrSequenceScope): Promise<SrCountedRows<SrCatalogReadback>>;
  events(scope: SrSequenceScope): Promise<SrCountedRows<SrEventReadback>>;
  telegram(eventIds: readonly string[]): Promise<SrCountedRows<SrTelegramReadback>>;
};
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const date = (v: string) => /^\d{4}-\d\d-\d\d$/.test(v) && Number.isFinite(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const complete = <T>(r: SrCountedRows<T>, maximum: number) => !r.error && Array.isArray(r.data) && Number.isSafeInteger(r.count) && r.count! >= 0 && r.count === r.data.length && r.count! <= maximum;

export function validateSrSequenceScope(raw: unknown): SrSequenceScope {
  const r = object(raw), keys = Object.keys(r);
  const parts = typeof r.week_key === "string" ? r.week_key.split("..") : [];
  if (keys.length !== 2 || !keys.includes("week_key") || !keys.includes("source_run_id") ||
      parts.length !== 2 || !parts.every(date) || parts[0] > parts[1] ||
      typeof r.source_run_id !== "string" || !r.source_run_id.trim() || r.source_run_id.trim() !== r.source_run_id || r.source_run_id.length > 240) {
    throw Error("cinema_sr_sequence_scope_invalid");
  }
  return { week_key: r.week_key as string, source_run_id: r.source_run_id };
}

/** Current schema cannot prove durable exact-attempt non-reuse or a never-attempted film.
 * Keep the pure sequencer disconnected until a reviewed durable attempt reader exists.
 * Even seven published catalog/ledger rows are NOT enough to attest sequence completion.
 */
export async function readSrTop7SequenceReview(port: SrSequenceReadPort, raw: unknown) {
  const scope = validateSrSequenceScope(raw);
  const blockers: string[] = [];
  const fail = (reason: string) => { if (!blockers.includes(reason)) blockers.push(reason); };
  let catalogCount: number | null = null, eventCount: number | null = null, telegramCount: number | null = null;
  try {
    const journal = await port.attempts(scope);
    if (!journal.error && Array.isArray(journal.data) && journal.count === journal.data.length) {
      try { validateSrAttemptJournal(journal.data, scope); }
      catch { fail("top7_attempt_history_invalid"); }
    } else fail("top7_attempt_history_unavailable");
  } catch { fail("top7_attempt_history_unavailable"); }
  try {
    const catalog = await port.catalog(scope);
    if (complete(catalog, 7)) catalogCount = catalog.count;
    if (!complete(catalog, 7) || catalog.count !== 7) fail("top7_exact_catalog_readback_incomplete");
    else {
      catalogCount = catalog.count;
      const ranks = new Set<number>(), ids = new Set<string>(), candidates = new Set<string>();
      const [start, end] = scope.week_key.split("..");
      for (const movie of catalog.data!) {
        if (!uuid(movie.id) || ids.has(movie.id) || !Number.isInteger(movie.rank) || movie.rank < 1 || movie.rank > 7 || ranks.has(movie.rank) ||
            typeof movie.source_movie_key !== "string" || !movie.source_movie_key.trim() || candidates.has(movie.source_movie_key) ||
            movie.city_id !== "olomouc" || movie.selection_week_start !== start || movie.selection_week_end !== end ||
            object(movie.readiness).verified_source_run_id !== scope.source_run_id) fail("top7_catalog_identity_or_run_mismatch");
        ids.add(movie.id); ranks.add(movie.rank); candidates.add(movie.source_movie_key);
      }
      const catalogInvalid = blockers.some(reason => reason.startsWith("top7_catalog") || reason === "top7_exact_catalog_readback_incomplete");
      if (!catalogInvalid) {
        const events = await port.events(scope);
        if (!complete(events, 100)) fail("top7_event_readback_incomplete");
        else {
          eventCount = events.count;
          const seen = new Set<string>();
          for (const event of events.data!) {
            const binding = object(object(event.metadata).cinemaCatalog);
            const movie = catalog.data!.find(m => m.id === binding.catalogMovieId);
            if (!uuid(event.id) || seen.has(event.id) || !movie || event.city_id !== "olomouc" ||
                binding.cityId !== movie.city_id || binding.sourceMovieKey !== movie.source_movie_key ||
                binding.rank !== movie.rank || binding.selectionWeekStart !== start || binding.selectionWeekEnd !== end ||
                movie.published_event_id !== event.id || movie.publication_state !== "published" ||
                event.status !== "published" || !event.published_at) fail("top7_event_identity_or_state_unverified");
            seen.add(event.id);
          }
          for (const movie of catalog.data!) {
            if (movie.published_event_id && !seen.has(movie.published_event_id)) fail("top7_catalog_event_missing");
          }
          const eventInvalid = blockers.some(reason => reason.startsWith("top7_event") || reason === "top7_catalog_event_missing");
          if (!eventInvalid && seen.size) {
            const telegram = await port.telegram([...seen]);
            if (complete(telegram, 100)) telegramCount = telegram.count;
            if (!complete(telegram, 100) || telegram.count !== seen.size) fail("top7_telegram_ledger_incomplete");
            else {
              telegramCount = telegram.count;
              const received = new Set<string>();
              for (const row of telegram.data!) {
                if (!seen.has(row.event_id) || received.has(row.event_id) || row.city_id !== "olomouc" ||
                    !Number.isSafeInteger(Number(row.telegram_message_id)) || Number(row.telegram_message_id) <= 0 ||
                    !Number.isSafeInteger(Number(row.telegram_chat_id)) || Number(row.telegram_chat_id) === 0 ||
                    row.deleted_at !== null || row.last_error !== null || !row.published_at) fail("top7_telegram_ledger_unverified");
                received.add(row.event_id);
              }
            }
          }
        }
      }
    }
  } catch { fail("top7_server_readback_unavailable"); }
  // This is a real schema capability gap, not an empty attempt list.
  const attemptHistory = blockers.includes("top7_attempt_history_invalid") ? "invalid" : blockers.includes("top7_attempt_history_unavailable") ? "unavailable" : "verified";
  fail("top7_exact_telegram_attempt_proof_unavailable");
  return {
    status: "SR_TOP7_SERVER_READBACK_NO_ACTION" as const, sequence_state: "blocked" as const,
    week_key: scope.week_key, source_run_id: scope.source_run_id,
    next_catalog_movie_id: null, next_rank: null, blockers,
    readback_counts: { catalog: catalogCount, events: eventCount, telegram: telegramCount },
    attempt_history: attemptHistory as "invalid" | "unavailable" | "verified", telegram_delivery_readback_verified: false as const,
    action: "none" as const, release_enabled: false as const,
    publication_authorized: false as const, telegram_send_authorized: false as const,
  };
}
