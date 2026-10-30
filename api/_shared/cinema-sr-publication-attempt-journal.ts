/** Kino000(SR): durable attempt journal contract. This module has no database side effects. */
export type SrPublicationAttemptStatus = "started" | "succeeded" | "failed" | "unknown";
export type SrPublicationAttempt = {
  attempt_id: string; week_key: string; source_run_id: string; rank: number;
  catalog_movie_id: string; candidate_key: string; status: SrPublicationAttemptStatus;
  catalog_event_id: string | null; telegram_chat_id: number | null; telegram_message_id: number | null;
  provider_outcome: "published" | "reused" | "failed" | "unknown" | null;
  independent_receipt: string | null; started_at: string; finished_at: string | null;
};
export type SrAttemptJournalPort = {
  attempts(scope: { week_key: string; source_run_id: string }): Promise<{ data: SrPublicationAttempt[] | null; count: number | null; error: unknown }>;
};

const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const iso = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
export function validateSrPublicationAttempt(raw: unknown): SrPublicationAttempt {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const statuses = ["started", "succeeded", "failed", "unknown"];
  if (!uuid(r.attempt_id) || typeof r.week_key !== "string" || typeof r.source_run_id !== "string" ||
      !Number.isInteger(r.rank) || Number(r.rank) < 1 || Number(r.rank) > 7 || !uuid(r.catalog_movie_id) ||
      typeof r.candidate_key !== "string" || !r.candidate_key.trim() || !statuses.includes(String(r.status)) ||
      !iso(r.started_at) || (r.finished_at !== null && !iso(r.finished_at)) ||
      (r.catalog_event_id !== null && !uuid(r.catalog_event_id)) ||
      (r.telegram_chat_id !== null && !Number.isSafeInteger(Number(r.telegram_chat_id))) ||
      (r.telegram_message_id !== null && !Number.isSafeInteger(Number(r.telegram_message_id)))) throw Error("cinema_sr_publication_attempt_invalid");
  return r as unknown as SrPublicationAttempt;
}

/** A journal is valid only when it is complete, append-only, unique by attempt_id and identity-consistent. */
export function validateSrAttemptJournal(rows: readonly unknown[], scope: { week_key: string; source_run_id: string }) {
  const seen = new Set<string>();
  const attempts = rows.map(validateSrPublicationAttempt);
  for (const a of attempts) {
    if (seen.has(a.attempt_id) || a.week_key !== scope.week_key || a.source_run_id !== scope.source_run_id || seen.has(`${a.rank}:${a.catalog_movie_id}`))
      throw Error("cinema_sr_publication_attempt_identity_invalid");
    seen.add(a.attempt_id); seen.add(`${a.rank}:${a.catalog_movie_id}`);
    if (a.status === "succeeded" && (a.provider_outcome !== "published" || !a.catalog_event_id || !a.independent_receipt || !a.finished_at || !a.telegram_message_id))
      throw Error("cinema_sr_publication_attempt_success_receipt_missing");
  }
  return attempts;
}
