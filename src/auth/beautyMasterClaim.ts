import {
  getCurrentAuthSession,
  getTrustedAccessToken,
  replaceTrustedSessionFromRefresh,
} from "../authSession";
import type { UserRole } from "../types";
import { createWebProviderTrustedSession } from "./providerTrustedSession";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type BeautyMasterClaimResult = {
  requestId: string;
  profileId: string;
  slug: string;
};

type ClaimPayload = {
  status?: string;
  error?: string;
  requestId?: string | null;
  profile?: {
    id?: string | null;
    slug?: string | null;
    publicationState?: string | null;
  };
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

export const isBeautyMasterClaimToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value.trim());

export async function claimBeautyMasterOnboarding(claimToken: string): Promise<BeautyMasterClaimResult> {
  const token = claimToken.trim();
  if (!isBeautyMasterClaimToken(token)) throw new Error("beauty_master_claim_invalid");
  if (!supabaseUrl || !publishableKey) throw new Error("beauty_master_claim_env_missing");

  const currentSession = getCurrentAuthSession();
  if (
    !currentSession
    || currentSession.source !== "trusted-provider"
    || currentSession.user.provider !== "google"
  ) throw new Error("beauty_master_claim_google_session_required");

  const accessToken = await getTrustedAccessToken();
  if (!accessToken) throw new Error("beauty_master_claim_session_required");

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/claimBeautyMasterOnboarding`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "x-beauty-claim-token": token,
      },
    });
  } catch {
    throw new Error("beauty_master_claim_unavailable");
  }

  const payload = await response.json().catch(() => null) as ClaimPayload | null;
  if (!response.ok || payload?.status !== "accepted") {
    const status = payload?.status || payload?.error || "claim_failed";
    throw new Error(`beauty_master_claim_${status}`);
  }

  if (
    !payload.requestId
    || !payload.profile?.id
    || !payload.profile.slug
    || payload.profile.publicationState !== "draft"
    || !payload.session?.access_token
    || !payload.session.expires_at
    || !payload.user?.id
    || !payload.user.userKey
    || payload.user.provider !== "google"
    || payload.user.role !== "professional"
    || payload.user.id !== currentSession.user.id
    || payload.user.userKey !== currentSession.user.userKey
  ) throw new Error("beauty_master_claim_invalid_response");

  const refreshed = createWebProviderTrustedSession<UserRole>({
    accessToken: payload.session.access_token,
    expiresAt: payload.session.expires_at,
    user: {
      id: payload.user.id,
      userKey: payload.user.userKey,
      provider: "google",
      role: payload.user.role,
    },
  });
  replaceTrustedSessionFromRefresh(refreshed);

  return {
    requestId: payload.requestId,
    profileId: payload.profile.id,
    slug: payload.profile.slug,
  };
}
