/** Kino000(SR): server-only durable attempt writer. It records evidence but never authorizes publication. */
import { validateSrPublicationAttempt, type SrPublicationAttempt, type SrPublicationAttemptStatus } from "./cinema-sr-publication-attempt-journal.js";

type QueryResult<T> = { data: T | null; error: unknown };
type Db = {
  from(table: string): {
    insert(values: Record<string, unknown>): { select<T>(columns: string): { single(): Promise<QueryResult<T>> } };
    update(values: Record<string, unknown>): { eq(column: string, value: string): { select<T>(columns: string): { single(): Promise<QueryResult<T>> } } };
  };
};

const columns = "attempt_id,week_key,source_run_id,rank,catalog_movie_id,candidate_key,status,catalog_event_id,telegram_chat_id,telegram_message_id,provider_outcome,independent_receipt,started_at,finished_at";
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fail = (code: string): never => { throw Error(code); };

export type SrAttemptStart = {
  week_key: string; source_run_id: string; rank: number; catalog_movie_id: string; candidate_key: string;
};
export type SrAttemptFinish = {
  attempt_id: string; status: Exclude<SrPublicationAttemptStatus, "started">;
  catalog_event_id?: string | null; telegram_chat_id?: number | null; telegram_message_id?: number | null;
  provider_outcome?: "published" | "reused" | "failed" | "unknown" | null;
  independent_receipt?: string | null; finished_at?: string;
};

/** Persists `started` before side effects, then records terminal evidence after the provider returns. */
export function createSrAttemptJournalWriter(db: Db) {
  return {
    async start(input: SrAttemptStart): Promise<SrPublicationAttempt> {
      if (!input || !Number.isInteger(input.rank) || input.rank < 1 || input.rank > 7 || !uuid(input.catalog_movie_id) ||
          typeof input.week_key !== "string" || !input.week_key.trim() || typeof input.source_run_id !== "string" || !input.source_run_id.trim() ||
          typeof input.candidate_key !== "string" || !input.candidate_key.trim()) fail("cinema_sr_publication_attempt_start_invalid");
      const result = await db.from("cinema_sr_publication_attempts").insert({
        week_key: input.week_key, source_run_id: input.source_run_id, rank: input.rank,
        catalog_movie_id: input.catalog_movie_id, candidate_key: input.candidate_key, status: "started",
      }).select(columns).single();
      if (result.error || !result.data) fail("cinema_sr_publication_attempt_start_failed");
      return validateSrPublicationAttempt(result.data);
    },
    async finish(input: SrAttemptFinish): Promise<SrPublicationAttempt> {
      if (!input || !uuid(input.attempt_id) || !["succeeded", "failed", "unknown"].includes(input.status)) fail("cinema_sr_publication_attempt_finish_invalid");
      const row = {
        status: input.status, catalog_event_id: input.catalog_event_id ?? null,
        telegram_chat_id: input.telegram_chat_id ?? null, telegram_message_id: input.telegram_message_id ?? null,
        provider_outcome: input.provider_outcome ?? null, independent_receipt: input.independent_receipt ?? null,
        finished_at: input.finished_at ?? new Date().toISOString(),
      };
      if (input.status === "succeeded" && (row.provider_outcome !== "published" || !uuid(row.catalog_event_id) ||
          !Number.isSafeInteger(Number(row.telegram_message_id)) || Number(row.telegram_message_id) < 1 ||
          typeof row.independent_receipt !== "string" || !row.independent_receipt.trim())) fail("cinema_sr_publication_attempt_success_receipt_missing");
      const result = await db.from("cinema_sr_publication_attempts").update(row).eq("attempt_id", input.attempt_id).select(columns).single();
      if (result.error || !result.data) fail("cinema_sr_publication_attempt_finish_failed");
      return validateSrPublicationAttempt(result.data);
    },
  };
}
