/** Kino000(SR) Top-7 sequencing PLAN. NEVER performs a claim, write or send. */
import type { SrPolicyHandoff } from "./cinema-sr-policy-handoff.js";

export type SrTop7Attempt = {
  catalog_movie_id: string;
  candidate_id: string;
  week_key: string;
  source_run_id: string;
  rank: number;
  status: "succeeded" | "failed" | "in_progress" | "unknown";
  /** Only successful, independently read-back delivery evidence is usable. */
  event_id: string | null;
  /** The event IDs must be read back independently from catalog and Telegram audit. */
  catalog_published_event_id: string | null;
  telegram_published_event_id: string | null;
  telegram_result_reused: boolean;
  telegram_message_id: number | null;
  telegram_delivery_readback_verified: boolean;
  catalog_published_readback_verified: boolean;
  event_published_readback_verified: boolean;
};

export type SrTop7SequencePlan = {
  status: "SR_TOP7_SEQUENCE_REVIEW_ONLY";
  sequence_state: "review_next" | "blocked" | "complete";
  next_catalog_movie_id: string | null;
  next_rank: number | null;
  confirmed_prior_ranks: number[];
  blockers: string[];
  action: "none";
  release_enabled: false;
  publication_authorized: false;
  telegram_send_authorized: false;
  next_review_is_not_publication_authorization: true;
};

const uuid = (v: unknown) => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const valid = (v: unknown) => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= 240;
const blocked = (why: string, confirmed: number[] = []): SrTop7SequencePlan => ({
  status: "SR_TOP7_SEQUENCE_REVIEW_ONLY", sequence_state: "blocked",
  next_catalog_movie_id: null, next_rank: null,
  confirmed_prior_ranks: [...confirmed], blockers: [why], action: "none",
  release_enabled: false, publication_authorized: false, telegram_send_authorized: false,
  next_review_is_not_publication_authorization: true,
});

/**
 * Caller MUST obtain policies, publication states and delivery audits independently
 * from trusted server readbacks. This pure function cannot attest their provenance.
 * A single failed/unknown/in-progress attempt blocks progress and automatic retry.
 */
export function planSrTop7NextReview(
  policies: readonly SrPolicyHandoff[],
  attempts: readonly SrTop7Attempt[],
): SrTop7SequencePlan {
  if (!Array.isArray(policies) || policies.length !== 7 || !Array.isArray(attempts)) {
    return blocked("top7_exactly_seven_policy_rows_required");
  }
  const byRank = new Map<number, SrPolicyHandoff>();
  const ids = new Set<string>();
  const candidates = new Set<string>();
  let week = "", run = "";
  for (const p of policies) {
    if (!p || !Number.isInteger(p.rank) || p.rank < 1 || p.rank > 7 || byRank.has(p.rank) ||
        !uuid(p.catalog_movie_id) || ids.has(p.catalog_movie_id) ||
        candidates.has(p.candidate_id) || !valid(p.week_key) ||
        !valid(p.source_run_id) || !valid(p.candidate_id) ||
        p.status !== "SR_POLICY_HANDOFF_NO_ACTION" || p.route !== "top7_automatic_individual" ||
        p.policy_version !== "kino000sr_ranked_individual_v1" ||
        p.individual_telegram_request_required !== false ||
        p.action !== "none" || p.release_enabled !== false || p.publication_authorized !== false ||
        p.telegram_send_authorized !== false || p.exact_movie_server_policy_gate_required !== true ||
        p.operator_release_gate_required !== true || !Array.isArray(p.blockers) ||
        (week && p.week_key !== week) || (run && p.source_run_id !== run)) {
      return blocked("top7_policy_identity_or_boundary_invalid");
    }
    byRank.set(p.rank, p); ids.add(p.catalog_movie_id); candidates.add(p.candidate_id);
    week = p.week_key; run = p.source_run_id;
  }
  const byRankAttempt = new Map<number, SrTop7Attempt>();
  for (const a of attempts) {
    const p = byRank.get(a?.rank);
    if (!p || byRankAttempt.has(a.rank) ||
        a.catalog_movie_id !== p.catalog_movie_id || a.candidate_id !== p.candidate_id ||
        a.week_key !== week || a.source_run_id !== run ||
        !["succeeded", "failed", "in_progress", "unknown"].includes(a.status)) {
      return blocked("top7_attempt_identity_or_duplicate_invalid");
    }
    byRankAttempt.set(a.rank, a);
  }

  const confirmed: number[] = [];
  for (let rank = 1; rank <= 7; rank++) {
    const p = byRank.get(rank)!;
    const a = byRankAttempt.get(rank);
    if (!a) {
      // A later attempt without a prior confirmed receipt is not a valid sequence.
      if (attempts.some(x => x.rank > rank)) return blocked("top7_attempt_out_of_order", confirmed);
      if (p.policy_eligible !== true || p.blockers.length !== 0) return blocked("top7_next_movie_evidence_not_ready", confirmed);
      return {
        status: "SR_TOP7_SEQUENCE_REVIEW_ONLY", sequence_state: "review_next",
        next_catalog_movie_id: p.catalog_movie_id, next_rank: rank,
        confirmed_prior_ranks: confirmed, blockers: [], action: "none",
        release_enabled: false, publication_authorized: false, telegram_send_authorized: false,
        next_review_is_not_publication_authorization: true,
      };
    }
    if (a.status !== "succeeded") return blocked(`top7_prior_attempt_${a.status}_stop`, confirmed);
    if (!uuid(a.event_id) || a.catalog_published_event_id !== a.event_id ||
        a.telegram_published_event_id !== a.event_id || a.telegram_result_reused !== false ||
        !Number.isSafeInteger(a.telegram_message_id) || Number(a.telegram_message_id) < 1 ||
        a.telegram_delivery_readback_verified !== true ||
        a.catalog_published_readback_verified !== true || a.event_published_readback_verified !== true) {
      return blocked("top7_prior_delivery_readback_incomplete", confirmed);
    }
    confirmed.push(rank);
  }
  return {
    status: "SR_TOP7_SEQUENCE_REVIEW_ONLY", sequence_state: "complete",
    next_catalog_movie_id: null, next_rank: null, confirmed_prior_ranks: confirmed,
    blockers: [], action: "none", release_enabled: false, publication_authorized: false,
    telegram_send_authorized: false, next_review_is_not_publication_authorization: true,
  };
}
