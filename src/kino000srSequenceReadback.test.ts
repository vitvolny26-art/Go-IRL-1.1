import { describe, expect, it } from "vitest";
import { readSrTop7SequenceReview, validateSrSequenceScope, type SrSequenceReadPort } from "../api/_shared/cinema-sr-sequence-readback";

const scope = { week_key: "2026-10-22..2026-11-04", source_run_id: "verified-run" };
const empty = (): SrSequenceReadPort => ({
  catalog: async () => ({ data: [], count: 0, error: null }),
  attempts: async () => ({ data: null, count: null, error: Error("journal table absent") }),
  events: async () => { throw Error("must not read events for incomplete catalog"); },
  telegram: async () => { throw Error("must not read ledger for incomplete catalog"); },
});

describe("Kino000(SR) server diagnostic readback", () => {
  it("distinguishes missing catalog/history from a never-attempted film", async () => {
    const result = await readSrTop7SequenceReview(empty(), scope);
    expect(result).toMatchObject({ sequence_state: "blocked", attempt_history: "unavailable", next_rank: null, action: "none", publication_authorized: false, telegram_send_authorized: false });
    expect(result.blockers).toContain("top7_exact_catalog_readback_incomplete");
    expect(result.blockers).toContain("top7_attempt_history_unavailable");
  });
  it("rejects truncated result sets", async () => {
    const port = empty(); port.catalog = async () => ({ data: [], count: 7, error: null });
    expect((await readSrTop7SequenceReview(port, scope)).blockers).toContain("top7_exact_catalog_readback_incomplete");
  });
  it("keeps connection failure unknown, never empty", async () => {
    const port = empty(); port.catalog = async () => { throw Error("offline"); };
    expect((await readSrTop7SequenceReview(port, scope)).blockers).toContain("top7_server_readback_unavailable");
  });
  it("refuses client-supplied history, release flags and impossible dates", () => {
    expect(() => validateSrSequenceScope({ ...scope, attempts: [] })).toThrow();
    expect(() => validateSrSequenceScope({ ...scope, publication_authorized: true })).toThrow();
    expect(() => validateSrSequenceScope({ ...scope, week_key: "2026-02-30..2026-03-01" })).toThrow();
  });
});
