import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "../types";
import { createWebProviderTrustedSession, type ProviderTrustedSession } from "./providerTrustedSession";
import {
  consumeWebAuthResumeIntent,
  createFacebookWebAuthStartRequest,
  createGoogleWebAuthStartRequest,
  parseWebAuthCallback,
  storeWebAuthResumeIntent,
  webAuthCallbackPath,
  type WebAuthMode,
  type WebAuthProvider,
} from "./webAuthFlow";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let webAuthClient: SupabaseClient | null = null;

const requireBrowserConfig = () => {
  if (typeof window === "undefined") throw new Error("web_auth_browser_required");
  if (!supabaseUrl || !publishableKey) throw new Error("web_auth_env_missing");
  return { supabaseUrl, publishableKey };
};

const getWebAuthClient = () => {
  if (webAuthClient) return webAuthClient;
  const config = requireBrowserConfig();
  webAuthClient = createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
      persistSession: true,
      storage: window.sessionStorage,
    },
  });
  return webAuthClient;
};

type WebProviderBootstrapPayload = {
  error?: string;
  session?: {
    access_token?: string;
    expires_at?: number;
  };
  user?: {
    id?: string;
    userKey?: string;
    provider?: WebAuthProvider;
    role?: UserRole;
  };
};

type LinkProviderPayload = {
  status?: "linked" | "already_linked";
  provider?: WebAuthProvider;
  error?: string;
};

export type WebAuthCallbackResult =
  | { status: "not_callback" }
  | { status: "success"; session: ProviderTrustedSession<UserRole>; returnTo: string }
  | { status: "linked" | "already_linked"; provider: WebAuthProvider; returnTo: string }
  | { status: "error"; error: string; mode?: WebAuthMode; provider?: WebAuthProvider; returnTo?: string };

export type GoogleWebAuthCallbackResult = WebAuthCallbackResult;

export const webAuthVerifierFunctionName = (provider: WebAuthProvider) =>
  provider === "facebook" ? "verifyFacebookSession" : "verifyGoogleSession";

export const isWebAuthProviderEnabled = (
  provider: WebAuthProvider,
  facebookEnabled = import.meta.env.VITE_GO_IRL_FACEBOOK_AUTH_ENABLED === "true",
) => provider !== "facebook" || facebookEnabled;

const clearTransientProviderSession = async () => {
  try {
    await getWebAuthClient().auth.signOut({ scope: "local" });
  } catch {
    // The GO IRL session remains authoritative; provider proof is never persisted as fallback state.
  }
};

const finishProviderProof = async (result: WebAuthCallbackResult): Promise<WebAuthCallbackResult> => {
  await clearTransientProviderSession();
  return result;
};

export async function beginWebAuth(
  provider: WebAuthProvider,
  currentUrl = window.location.href,
  mode: WebAuthMode = "sign-in",
) {
  if (!isWebAuthProviderEnabled(provider)) throw new Error(`${provider}_oauth_disabled`);
  const config = requireBrowserConfig();
  const request = provider === "facebook"
    ? createFacebookWebAuthStartRequest(currentUrl, window.location.origin, mode)
    : createGoogleWebAuthStartRequest(currentUrl, window.location.origin, mode);
  storeWebAuthResumeIntent(window.sessionStorage, request);
  const { data, error } = await getWebAuthClient().auth.signInWithOAuth({
    provider: request.provider,
    options: {
      redirectTo: request.redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    window.sessionStorage.removeItem("go-irl-web-auth-resume-v1");
    throw new Error(`${provider}_oauth_start_failed`);
  }
  window.location.assign(data.url);
  return config.supabaseUrl;
}

export const beginGoogleWebAuth = (currentUrl = window.location.href, mode: WebAuthMode = "sign-in") =>
  beginWebAuth("google", currentUrl, mode);
export const beginFacebookWebAuth = (currentUrl = window.location.href, mode: WebAuthMode = "sign-in") =>
  beginWebAuth("facebook", currentUrl, mode);

export async function completeWebAuthCallback(currentGoIrlAccessToken?: string | null): Promise<WebAuthCallbackResult> {
  if (typeof window === "undefined" || window.location.pathname !== webAuthCallbackPath) {
    return { status: "not_callback" };
  }

  const parsed = parseWebAuthCallback(window.location.href, window.location.origin);
  const resume = consumeWebAuthResumeIntent(window.sessionStorage, window.location.origin);
  if (!resume) return { status: "error", error: "oauth_resume_missing_or_stale" };
  if (parsed.status === "provider_error") {
    return finishProviderProof({
      status: "error",
      error: parsed.error,
      mode: resume.mode,
      provider: resume.provider,
      returnTo: resume.returnTo,
    });
  }
  if (parsed.status !== "code") {
    return finishProviderProof({
      status: "error",
      error: "invalid_oauth_callback",
      mode: resume.mode,
      provider: resume.provider,
      returnTo: resume.returnTo,
    });
  }

  const config = requireBrowserConfig();
  const { data, error } = await getWebAuthClient().auth.exchangeCodeForSession(parsed.code);
  const providerAccessToken = data.session?.access_token;
  if (error || !providerAccessToken) {
    await clearTransientProviderSession();
    return {
      status: "error",
      error: "oauth_code_exchange_failed",
      mode: resume.mode,
      provider: resume.provider,
      returnTo: resume.returnTo,
    };
  }

  const provider = resume.provider;
  if (resume.mode === "link") {
    if (!currentGoIrlAccessToken?.trim()) {
      return finishProviderProof({
        status: "error",
        error: "link_session_required",
        mode: "link",
        provider,
        returnTo: resume.returnTo,
      });
    }
    try {
      const response = await fetch(`${config.supabaseUrl}/functions/v1/linkProviderIdentity`, {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${currentGoIrlAccessToken}`,
          "x-provider-access-token": providerAccessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider }),
      });
      const payload = await response.json() as LinkProviderPayload;
      if (
        response.ok
        && payload.provider === provider
        && (payload.status === "linked" || payload.status === "already_linked")
      ) {
        return finishProviderProof({ status: payload.status, provider, returnTo: resume.returnTo });
      }
      return finishProviderProof({
        status: "error",
        error: payload.error || "identity_link_failed",
        mode: "link",
        provider,
        returnTo: resume.returnTo,
      });
    } catch {
      return finishProviderProof({
        status: "error",
        error: "identity_link_unavailable",
        mode: "link",
        provider,
        returnTo: resume.returnTo,
      });
    }
  }

  try {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/${webAuthVerifierFunctionName(provider)}`, {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${providerAccessToken}`,
        "Content-Type": "application/json",
      },
    });
    const payload = await response.json() as WebProviderBootstrapPayload;
    if (
      !response.ok
      || !payload.session?.access_token
      || !payload.session.expires_at
      || !payload.user?.id
      || !payload.user.userKey
      || payload.user.provider !== provider
      || !payload.user.role
    ) {
      return finishProviderProof({
        status: "error",
        error: payload.error || `${provider}_session_verification_failed`,
        mode: "sign-in",
        provider,
        returnTo: resume.returnTo,
      });
    }

    const session = createWebProviderTrustedSession<UserRole>({
      accessToken: payload.session.access_token,
      expiresAt: payload.session.expires_at,
      user: {
        id: payload.user.id,
        userKey: payload.user.userKey,
        provider,
        role: payload.user.role,
      },
    });

    return finishProviderProof({ status: "success", session, returnTo: resume.returnTo });
  } catch {
    return finishProviderProof({
      status: "error",
      error: `${provider}_session_verification_unavailable`,
      mode: "sign-in",
      provider,
      returnTo: resume.returnTo,
    });
  }
}

export const completeGoogleWebAuthCallback = completeWebAuthCallback;
