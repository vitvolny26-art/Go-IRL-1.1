import { getTrustedAccessToken } from "../authSession";

export type BeautyOwnerTransferSummary = {
  transferId: string;
  profileId: string;
  displayName: string;
  currentOwnerUserKey: string;
  candidateUserKey: string;
  candidateClaimedAt: string;
  expiresAt: string;
};

export type BeautyOwnerTransferDecisionResult = {
  status: "approved" | "rejected" | "owner_changed" | "candidate_unavailable" | "profile_conflict" | "role_conflict" | "not_found" | "not_decidable";
  profileId: string | null;
  previousOwnerUserKey: string | null;
  currentOwnerUserKey: string | null;
};

const requestAdminAction = async (body: Record<string, unknown>) => {
  const accessToken = await getTrustedAccessToken();
  if (!accessToken) throw new Error("trusted_session_required");
  const response = await fetch("/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const decision = payload?.beautyOwnerTransferDecision as { status?: unknown } | undefined;
    if (typeof decision?.status === "string") throw new Error(decision.status);
    throw new Error(typeof payload?.error === "string" ? payload.error : "beauty_owner_transfer_admin_failed");
  }
  return payload || {};
};

export async function requestPendingBeautyOwnerTransfers(): Promise<BeautyOwnerTransferSummary[]> {
  const payload = await requestAdminAction({ action: "list_beauty_owner_transfers" });
  return Array.isArray(payload.beautyOwnerTransfers) ? payload.beautyOwnerTransfers as BeautyOwnerTransferSummary[] : [];
}

export async function decideBeautyOwnerTransfer(
  transferId: string,
  decision: "approve" | "reject",
): Promise<BeautyOwnerTransferDecisionResult> {
  const payload = await requestAdminAction({ action: "decide_beauty_owner_transfer", transferId, decision });
  const result = payload.beautyOwnerTransferDecision as BeautyOwnerTransferDecisionResult | undefined;
  if (!result?.status) throw new Error("beauty_owner_transfer_admin_invalid_response");
  return result;
}

export const requestedBeautyOwnerTransferId = () => new URL(window.location.href).searchParams.get("beauty_transfer")?.trim() || "";
