/** Kino000(SR) product-policy routing. NO publication side effects or authorization. */
import type { SrHandoff, SrPreflight } from "./cinema-sr-publication-preflight.js";

export type SrPolicyHandoff = {
  status: "SR_POLICY_HANDOFF_NO_ACTION";
  policy_version: "kino000sr_ranked_individual_v1";
  catalog_movie_id: string;
  week_key: string;
  source_run_id: string;
  candidate_id: string;
  rank: number;
  route: "top7_automatic_individual" | "top8_10_exact_telegram_request";
  individual_telegram_request_required: boolean;
  exact_movie_server_policy_gate_required: true;
  operator_release_gate_required: true;
  policy_eligible: boolean;
  blockers: string[];
  action: "none";
  release_enabled: false;
  publication_authorized: false;
  telegram_send_authorized: false;
};

/** One input/one output. Never convert a product policy to a production approval. */
export function prepareSrPolicyHandoff(input: SrHandoff, preflight: SrPreflight): SrPolicyHandoff {
  if (input.catalog_movie_id !== preflight.catalog_movie_id ||
      input.rank !== preflight.rank || input.mode !== preflight.mode) {
    throw new Error("cinema_sr_policy_identity_changed");
  }
  const route = input.rank <= 7 ? "top7_automatic_individual" : "top8_10_exact_telegram_request";
  if (preflight.policy_route !== route || preflight.individual_telegram_request_required !== (input.rank >= 8)) {
    throw new Error("cinema_sr_policy_route_changed");
  }
  return {
    status: "SR_POLICY_HANDOFF_NO_ACTION",
    policy_version: "kino000sr_ranked_individual_v1",
    catalog_movie_id: input.catalog_movie_id,
    week_key: input.week_key,
    source_run_id: input.run_id,
    candidate_id: input.candidate_id,
    rank: input.rank,
    route,
    individual_telegram_request_required: input.rank >= 8,
    exact_movie_server_policy_gate_required: true,
    operator_release_gate_required: true,
    policy_eligible: preflight.evidence_complete,
    blockers: [...preflight.blockers],
    action: "none",
    release_enabled: false,
    publication_authorized: false,
    telegram_send_authorized: false,
  };
}
