import { describe, expect, it } from "vitest";
import { createSrAttemptJournalWriter } from "../api/_shared/cinema-sr-publication-attempt-writer";

const movie = "e896c63e-8fde-424c-b080-0484ebdf5693";
const attempt = "029c7f36-4727-439c-a89f-459c3f84708f";
const row = (status: string) => ({ attempt_id: attempt, week_key: "2026-10-22..2026-11-04", source_run_id: "run", rank: 1, catalog_movie_id: movie, candidate_key: "tt1", status, catalog_event_id: status === "succeeded" ? movie : null, telegram_chat_id: status === "succeeded" ? -1001 : null, telegram_message_id: status === "succeeded" ? 3 : null, provider_outcome: status === "succeeded" ? "published" : null, independent_receipt: status === "succeeded" ? "receipt" : null, started_at: "2026-10-30T00:00:00Z", finished_at: status === "started" ? null : "2026-10-30T00:01:00Z" });

const fakeDb = () => {
  const calls: Record<string, unknown>[] = [];
  let current = row("started");
  return { calls, db: { from: () => ({ insert: (v: Record<string, unknown>) => { calls.push(v); return { select: () => ({ single: async () => ({ data: current, error: null }) }) }; }, update: (v: Record<string, unknown>) => { calls.push(v); current = { ...current, ...v }; return { eq: () => ({ select: () => ({ single: async () => ({ data: current, error: null }) }) }) }; } }) } };
};

describe("Kino000(SR) server attempt writer", () => {
  it("writes started before side effects and terminal success with proof", async () => { const f = fakeDb(); const w = createSrAttemptJournalWriter(f.db as never); await w.start({ week_key: "2026-10-22..2026-11-04", source_run_id: "run", rank: 1, catalog_movie_id: movie, candidate_key: "tt1" }); await w.finish({ attempt_id: attempt, status: "succeeded", catalog_event_id: movie, telegram_chat_id: -1001, telegram_message_id: 3, provider_outcome: "published", independent_receipt: "receipt" }); expect(f.calls[0].status).toBe("started"); expect(f.calls[1].status).toBe("succeeded"); });
  it("rejects a success without independent receipt", async () => { const w = createSrAttemptJournalWriter(fakeDb().db as never); await expect(w.finish({ attempt_id: attempt, status: "succeeded", catalog_event_id: movie, telegram_message_id: 3, provider_outcome: "published" })).rejects.toThrow("success_receipt_missing"); });
  it("rejects malformed start identity", async () => { const w = createSrAttemptJournalWriter(fakeDb().db as never); await expect(w.start({ week_key: "x", source_run_id: "run", rank: 8, catalog_movie_id: movie, candidate_key: "tt1" })).rejects.toThrow("start_invalid"); });
});
