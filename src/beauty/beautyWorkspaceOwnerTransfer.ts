import { supabase } from "../supabase";
import {
  getCurrentAuthSession,
  getTrustedAccessToken,
  replaceTrustedSessionFromRefresh,
} from "../authSession";
import { createWebProviderTrustedSession } from "../auth/providerTrustedSession";
import type { UserRole } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const transferTtlMs = 3 * 24 * 60 * 60 * 1000;

export type PreparedBeautyWorkspaceOwnerTransfer = {
  status: "prepared";
  transferId: string;
  profileId: string;
  expiresAt: string;
  claimUrl: string;
  candidateMessage: string;
};

export type BeautyWorkspaceOwnerTransferCandidateState =
  | "pending_superadmin"
  | "approved"
  | "rejected";

type PrepareRpcRow = {
  status?: string;
  transfer_id?: string | null;
  profile_id?: string | null;
  expires_at?: string | null;
};

type CandidatePayload = {
  status?: string;
  error?: string;
  transferId?: string | null;
  profileId?: string | null;
  session?: {
    access_token?: string;
    expires_at?: number;
  };
  user?: {
    id?: string;
    userKey?: string;
    provider?: string;
    role?: UserRole;
  };
};

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export const isBeautyWorkspaceOwnerTransferToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value.trim());

export const createBeautyWorkspaceOwnerTransferToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

export const hashBeautyWorkspaceOwnerTransferToken = async (token: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export async function prepareBeautyWorkspaceOwnerTransfer(
  applicationOrigin = window.location.origin,
): Promise<PreparedBeautyWorkspaceOwnerTransfer> {
  const session = getCurrentAuthSession();
  if (!session?.accessToken || session.user.role !== "professional") {
    throw new Error("beauty_owner_transfer_professional_session_required");
  }

  const rawToken = createBeautyWorkspaceOwnerTransferToken();
  if (!isBeautyWorkspaceOwnerTransferToken(rawToken)) {
    throw new Error("beauty_owner_transfer_token_generation_failed");
  }
  const tokenHash = await hashBeautyWorkspaceOwnerTransferToken(rawToken);
  const expiresAt = new Date(Date.now() + transferTtlMs).toISOString();

  const result = await supabase.rpc("go_irl_request_beauty_workspace_owner_transfer", {
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (result.error) throw new Error("beauty_owner_transfer_prepare_failed");
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as PrepareRpcRow | null;
  if (!row || row.status !== "prepared" || !row.transfer_id || !row.profile_id || !row.expires_at) {
    throw new Error(`beauty_owner_transfer_${row?.status || "prepare_failed"}`);
  }

  const claimUrl = `${new URL(applicationOrigin).origin}/beauty/claim?owner_transfer=${encodeURIComponent(rawToken)}`;
  return {
    status: "prepared",
    transferId: row.transfer_id,
    profileId: row.profile_id,
    expiresAt: row.expires_at,
    claimUrl,
    candidateMessage: `GO IRL: вам предлагают стать владельцем кабинета мастера. Откройте одноразовую ссылку и войдите через Google. После идентификации запрос уйдёт суперадминистратору на подтверждение: ${claimUrl}`,
  };
}

async function requestCandidateTransferAction(
  token: string,
  action: "claim" | "status",
): Promise<CandidatePayload> {
  if (!isBeautyWorkspaceOwnerTransferToken(token)) throw new Error("beauty_owner_transfer_invalid");
  if (!supabaseUrl || !publishableKey) throw new Error("beauty_owner_transfer_env_missing");

  const currentSession = getCurrentAuthSession();
  if (!currentSession || currentSession.source !== "trusted-provider" || currentSession.user.provider !== "google") {
    throw new Error("beauty_owner_transfer_google_session_required");
  }
  const accessToken = await getTrustedAccessToken();
  if (!accessToken) throw new Error("beauty_owner_transfer_session_required");

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/claimBeautyWorkspaceOwnerTransfer`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-beauty-transfer-token": token,
      },
      body: JSON.stringify({ action }),
    });
  } catch {
    throw new Error("beauty_owner_transfer_unavailable");
  }

  const payload = await response.json().catch(() => null) as CandidatePayload | null;
  if (!payload) throw new Error("beauty_owner_transfer_invalid_response");
  if (!response.ok && payload.status !== "rejected") {
    throw new Error(`beauty_owner_transfer_${payload.status || payload.error || "request_failed"}`);
  }
  return payload;
}

const applyApprovedSession = (payload: CandidatePayload) => {
  const currentSession = getCurrentAuthSession();
  if (
    !currentSession
    || !payload.session?.access_token
    || !payload.session.expires_at
    || !payload.user?.id
    || !payload.user.userKey
    || payload.user.provider !== "google"
    || payload.user.role !== "professional"
    || payload.user.id !== currentSession.user.id
    || payload.user.userKey !== currentSession.user.userKey
  ) throw new Error("beauty_owner_transfer_invalid_approved_session");

  replaceTrustedSessionFromRefresh(createWebProviderTrustedSession<UserRole>({
    accessToken: payload.session.access_token,
    expiresAt: payload.session.expires_at,
    user: {
      id: payload.user.id,
      userKey: payload.user.userKey,
      provider: "google",
      role: "professional",
    },
  }));
};

export async function claimBeautyWorkspaceOwnerTransfer(
  token: string,
): Promise<{ status: BeautyWorkspaceOwnerTransferCandidateState; transferId: string; profileId: string }> {
  const payload = await requestCandidateTransferAction(token.trim(), "claim");
  if (!payload.transferId || !payload.profileId || !payload.status) {
    throw new Error("beauty_owner_transfer_invalid_response");
  }
  if (payload.status === "approved") applyApprovedSession(payload);
  if (payload.status !== "pending_superadmin" && payload.status !== "approved" && payload.status !== "rejected") {
    throw new Error(`beauty_owner_transfer_${payload.status}`);
  }
  return { status: payload.status, transferId: payload.transferId, profileId: payload.profileId };
}

export async function checkBeautyWorkspaceOwnerTransfer(
  token: string,
): Promise<{ status: BeautyWorkspaceOwnerTransferCandidateState; transferId: string; profileId: string }> {
  const payload = await requestCandidateTransferAction(token.trim(), "status");
  if (!payload.transferId || !payload.profileId || !payload.status) {
    throw new Error("beauty_owner_transfer_invalid_response");
  }
  if (payload.status === "approved") applyApprovedSession(payload);
  if (payload.status !== "pending_superadmin" && payload.status !== "approved" && payload.status !== "rejected") {
    throw new Error(`beauty_owner_transfer_${payload.status}`);
  }
  return { status: payload.status, transferId: payload.transferId, profileId: payload.profileId };
}
