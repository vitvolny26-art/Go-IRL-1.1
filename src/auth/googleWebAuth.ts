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
    providerUserId?: string;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    role?: UserRole;
  };
};

export type GoogleWebAuthCallbackResult =
  | { status: "not_callback" }
  | { status: "success"; session: ProviderTrustedSession<UserRole>; returnTo: string }
  | { status: "error"; error: string };

export const webAuthVerifierFunctionName = (provider: WebAuthProvider) =>
  provider === "facebook" ? "verifyFacebookSession" : "verifyGoogleSession";

export const isWebAuthProviderEnabled = (
  provider: WebAuthProvider,
  facebookEnabled = import.meta.env.VITE_GO_IRL_FACEBOOK_AUTH_ENABLED === "true",
) => provider !== "facebook" || facebookEnabled;

export async function beginWebAuth(provider: WebAuthProvider, currentUrl = window.location.href) {
  if (!isWebAuthProviderEnabled(provider)) throw new Error(`${provider}_oauth_disabled`);
  const config = requireBrowserConfig();
  const request = provider === "facebook"
    ? createFacebookWebAuthStartRequest(currentUrl, window.location.origin)
    : createGoogleWebAuthStartRequest(currentUrl, window.location.origin);
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

export const beginGoogleWebAuth = (currentUrl = window.location.href) => beginWebAuth("google", currentUrl);
export const beginFacebookWebAuth = (currentUrl = window.location.href) => beginWebAuth("facebook", currentUrl);

export async function completeWebAuthCallback(): Promise<GoogleWebAuthCallbackResult> {
  if (typeof window === "undefined" || window.location.pathname !== webAuthCallbackPath) {
    return { status: "not_callback" };
  }

  const parsed = parseWebAuthCallback(window.location.href, window.location.origin);
  const resume = consumeWebAuthResumeIntent(window.sessionStorage, window.location.origin);
  if (parsed.status === "provider_error") return { status: "error", error: parsed.error };
  if (parsed.status !== "code") return { status: "error", error: "invalid_oauth_callback" };
  if (!resume) return { status: "error", error: "oauth_resume_missing_or_stale" };

  const config = requireBrowserConfig();
  const { data, error } = await getWebAuthClient().auth.exchangeCodeForSession(parsed.code);
  const providerAccessToken = data.session?.access_token;
  if (error || !providerAccessToken) return { status: "error", error: "oauth_code_exchange_failed" };

  const provider = resume.provider;
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
      || !payload.user.providerUserId
      || !payload.user.role
    ) {
      return { status: "error", error: payload.error || `${provider}_session_verification_failed` };
    }

    const session = createWebProviderTrustedSession<UserRole>({
      accessToken: payload.session.access_token,
      expiresAt: payload.session.expires_at,
      user: {
        id: payload.user.id,
        userKey: payload.user.userKey,
        provider,
        providerUserId: payload.user.providerUserId,
        firstName: payload.user.firstName ?? null,
        lastName: payload.user.lastName ?? null,
        username: payload.user.username ?? null,
        role: payload.user.role,
      },
    });

    return { status: "success", session, returnTo: resume.returnTo };
  } catch {
    return { status: "error", error: `${provider}_session_verification_unavailable` };
  }
}

export const completeGoogleWebAuthCallback = completeWebAuthCallback;
