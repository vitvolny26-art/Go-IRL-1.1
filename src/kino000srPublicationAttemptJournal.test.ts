import { describe, expect, it } from "vitest";
import { validateSrAttemptJournal, validateSrPublicationAttempt } from "../api/_shared/cinema-sr-publication-attempt-journal";
const row = { attempt_id:"029c7f36-4727-439c-a89f-459c3f84708f", week_key:"2026-10-22..2026-11-04", source_run_id:"run", rank:1, catalog_movie_id:"e896c63e-8fde-424c-b080-0484ebdf5693", candidate_key:"tt1", status:"started", catalog_event_id:null, telegram_chat_id:null, telegram_message_id:null, provider_outcome:null, independent_receipt:null, started_at:"2026-10-30T00:00:00Z", finished_at:null };
describe("Kino000(SR) publication attempt journal", () => {
  it("accepts a started attempt before side effects", () => expect(validateSrPublicationAttempt(row).status).toBe("started"));
  it("requires a complete independent receipt for success", () => expect(() => validateSrAttemptJournal([{...row, status:"succeeded", provider_outcome:"published", catalog_event_id:row.catalog_movie_id, telegram_message_id:1}], {week_key:row.week_key, source_run_id:row.source_run_id})).toThrow("success_receipt_missing"));
  it("rejects duplicate identity in an append-only journal", () => expect(() => validateSrAttemptJournal([row, {...row, attempt_id:"e896c63e-8fde-424c-b080-0484ebdf5693"}], {week_key:row.week_key, source_run_id:row.source_run_id})).toThrow("identity_invalid"));
});
