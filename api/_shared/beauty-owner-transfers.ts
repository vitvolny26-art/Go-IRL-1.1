import { createClient } from "@supabase/supabase-js";
import type { AuthorizedAdmin } from "./admin-authorization.js";
import { requireEnv } from "./env.js";

export type BeautyOwnerTransferAdminAction = "list_beauty_owner_transfers" | "decide_beauty_owner_transfer";
export type BeautyOwnerTransferDecision = "approve" | "reject";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PendingRow = {
  transfer_id: string;
  profile_id: string;
  display_name: string;
  current_owner_user_key: string;
  candidate_user_key: string;
  candidate_claimed_at: string;
  expires_at: string;
};

type DecisionRow = {
  status: string;
  profile_id: string | null;
  previous_owner_user_key: string | null;
  current_owner_user_key: string | null;
};

const db = () => createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function listPendingBeautyOwnerTransfers(authorization: AuthorizedAdmin) {
  if (authorization.role !== "superadmin") return { status: 403, payload: { error: "access_denied" } };
  const result = await db().rpc("go_irl_list_pending_beauty_workspace_owner_transfers", {
    p_superadmin_user_key: authorization.userKey,
  });
  if (result.error) throw result.error;
  const rows = (result.data || []) as PendingRow[];
  return {
    status: 200,
    payload: {
      beautyOwnerTransfers: rows.map((row) => ({
        transferId: row.transfer_id,
        profileId: row.profile_id,
        displayName: row.display_name,
        currentOwnerUserKey: row.current_owner_user_key,
        candidateUserKey: row.candidate_user_key,
        candidateClaimedAt: row.candidate_claimed_at,
        expiresAt: row.expires_at,
      })),
    },
  };
}

export async function decideBeautyOwnerTransfer(
  authorization: AuthorizedAdmin,
  transferId: unknown,
  decision: unknown,
) {
  if (authorization.role !== "superadmin") return { status: 403, payload: { error: "access_denied" } };
  const normalizedId = typeof transferId === "string" ? transferId.trim() : "";
  const normalizedDecision = decision === "approve" || decision === "reject" ? decision : null;
  if (!uuidPattern.test(normalizedId) || !normalizedDecision) return { status: 400, payload: { error: "invalid_request" } };

  const result = await db().rpc("go_irl_decide_beauty_workspace_owner_transfer", {
    p_transfer_id: normalizedId,
    p_decision: normalizedDecision,
    p_superadmin_user_key: authorization.userKey,
  }).single<DecisionRow>();
  if (result.error || !result.data) throw result.error || new Error("beauty_owner_transfer_decision_failed");
  const row = result.data;
  const ok = row.status === "approved" || row.status === "rejected";
  return {
    status: ok ? 200 : row.status === "not_found" ? 404 : 409,
    payload: {
      beautyOwnerTransferDecision: {
        status: row.status,
        profileId: row.profile_id,
        previousOwnerUserKey: row.previous_owner_user_key,
        currentOwnerUserKey: row.current_owner_user_key,
      },
    },
  };
}
