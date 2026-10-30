import { describe, expect, it } from "vitest";
import { planSrTop7NextReview, type SrTop7Attempt } from "../api/_shared/cinema-sr-top7-sequence";
import type { SrPolicyHandoff } from "../api/_shared/cinema-sr-policy-handoff";

const id = (num: number) => `123e4567-e89b-42d3-a456-${String(num).padStart(12, "0")}`;
const policies = (): SrPolicyHandoff[] => Array.from({ length: 7 }, (_, i) => ({
  status: "SR_POLICY_HANDOFF_NO_ACTION", policy_version: "kino000sr_ranked_individual_v1",
  catalog_movie_id: id(i + 1), candidate_id: `candidate-${i + 1}`, rank: i + 1,
  week_key: "2026-10-22..2026-11-04", source_run_id: "verified-snapshot-1",
  route: "top7_automatic_individual", individual_telegram_request_required: false,
  exact_movie_server_policy_gate_required: true, operator_release_gate_required: true,
  policy_eligible: true, blockers: [], action: "none", release_enabled: false,
  publication_authorized: false, telegram_send_authorized: false,
}));
const receipt = (rank: number): SrTop7Attempt => ({
  catalog_movie_id: id(rank), candidate_id: `candidate-${rank}`,
  week_key: "2026-10-22..2026-11-04", source_run_id: "verified-snapshot-1",
  rank, status: "succeeded", event_id: id(rank + 100),
  catalog_published_event_id: id(rank + 100), telegram_published_event_id: id(rank + 100),
  telegram_result_reused: false, telegram_message_id: rank,
  telegram_delivery_readback_verified: true,
  catalog_published_readback_verified: true,
  event_published_readback_verified: true,
});

describe("Kino000(SR) no-action Top7 sequence", () => {
  it("returns at most one exact UUID for review, with no release rights", () => {
    expect(planSrTop7NextReview(policies(), [])).toMatchObject({
      sequence_state: "review_next", next_rank: 1, next_catalog_movie_id: id(1),
      action: "none", release_enabled: false, publication_authorized: false,
      telegram_send_authorized: false,
    });
  });
  it("only advances on prior delivery + DB readbacks", () => {
    expect(planSrTop7NextReview(policies(), [receipt(1)])).toMatchObject({ next_rank: 2, confirmed_prior_ranks: [1] });
    const missing = receipt(1); missing.telegram_delivery_readback_verified = false;
    expect(planSrTop7NextReview(policies(), [missing])).toMatchObject({ sequence_state: "blocked", next_rank: null });
  });
  it("rejects event mismatch and reused Telegram result", () => {
    const wrong = receipt(1); wrong.telegram_published_event_id = id(998);
    expect(planSrTop7NextReview(policies(), [wrong])).toMatchObject({ blockers: ["top7_prior_delivery_readback_incomplete"] });
    const reused = receipt(1); reused.telegram_result_reused = true;
    expect(planSrTop7NextReview(policies(), [reused])).toMatchObject({ blockers: ["top7_prior_delivery_readback_incomplete"] });
  });
  it("stops on failed, unknown or in-progress attempt; does not retry", () => {
    for (const status of ["failed", "unknown", "in_progress"] as const) {
      const x = receipt(1); x.status = status;
      expect(planSrTop7NextReview(policies(), [x])).toMatchObject({
        sequence_state: "blocked", blockers: [`top7_prior_attempt_${status}_stop`],
      });
    }
  });
  it("rejects conflicting identities, duplicates and out-of-order attempts", () => {
    expect(planSrTop7NextReview(policies(), [receipt(2)])).toMatchObject({ blockers: ["top7_attempt_out_of_order"] });
    expect(planSrTop7NextReview(policies(), [receipt(1), receipt(1)])).toMatchObject({ blockers: ["top7_attempt_identity_or_duplicate_invalid"] });
    const wrong = receipt(1); wrong.catalog_movie_id = id(999);
    expect(planSrTop7NextReview(policies(), [wrong])).toMatchObject({ blockers: ["top7_attempt_identity_or_duplicate_invalid"] });
  });
  it("blocks incomplete policy evidence and wrong rank lane", () => {
    const unready = policies(); unready[0].policy_eligible = false;
    expect(planSrTop7NextReview(unready, [])).toMatchObject({ blockers: ["top7_next_movie_evidence_not_ready"] });
    const duplicate = policies(); duplicate[1].candidate_id = duplicate[0].candidate_id;
    expect(planSrTop7NextReview(duplicate, [])).toMatchObject({ blockers: ["top7_policy_identity_or_boundary_invalid"] });
    const wrong = policies(); wrong[6].route = "top8_10_exact_telegram_request";
    expect(planSrTop7NextReview(wrong, [])).toMatchObject({ blockers: ["top7_policy_identity_or_boundary_invalid"] });
  });
  it("never auto-continues past the 7th verified receipt", () => {
    const r = planSrTop7NextReview(policies(), Array.from({ length: 7 }, (_, i) => receipt(i + 1)));
    expect(r).toMatchObject({ sequence_state: "complete", next_catalog_movie_id: null,
      confirmed_prior_ranks: [1, 2, 3, 4, 5, 6, 7], action: "none" });
  });
});
