import { resolveDemoIdentity, type DemoIdentityResolution } from "./securityIdentity";
import { createSingleFlight } from "./singleFlight";
import { getTelegramInitData, getTelegramWebApp } from "./telegram";
import type { UserRole } from "./types";
import type { RoleInvitationTargetRole } from "./admin/roleInvitations";
import { normalizeRoleInvitationResult } from "./admin/roleInvitationResult";
import {
  fingerprintRoleInvitationStartParam,
  shouldProcessRoleInvitation,
} from "./admin/roleInvitationSession";
import { writeAccountSecurityFeedback } from "./auth/accountSecurity";
import { completeWebAuthCallback } from "./auth/googleWebAuth";
import type { ProviderTrustedSession } from "./auth/providerTrustedSession";
import { webAuthCallbackPath } from "./auth/webAuthFlow";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configuredDemoAuthEnabled = import.meta.env.DEV || import.meta.env.VITE_GO_IRL_LEGACY_DEMO_AUTH === "true";
export const browserMockTelegramId = 999999;
export const browserMockUserKey = `telegram:${browserMockTelegramId}`;
export const browserMockDisplayName = "Vit_Test";
const isBrowserMockAuthEnabled = () => typeof window !== "undefined" && !getTelegramInitData();
const isDemoAuthEnabled = () => configuredDemoAuthEnabled || isBrowserMockAuthEnabled();
const sessionStorageKey = "go-irl-trusted-session-v2";

const memoryIdentityStorage = (() => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
})();

const getIdentityStorage = () =>
  typeof localStorage === "undefined" ? memoryIdentityStorage : localStorage;

const createIdentityUuid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export type TrustedAuthUser = {
  id: string;
  userKey: string;
  telegramId: number;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  role: UserRole;
};

export type TelegramTrustedAuthSession = {
  accessToken: string;
  expiresAt: number;
  user: TrustedAuthUser;
  startParam?: string;
  processedRoleInvitationFingerprint?: string | null;
  roleInvitation?: {
    status: "accepted" | "invalid" | "role_conflict";
    targetRole: RoleInvitationTargetRole | null;
  } | null;
  source: "trusted-telegram";
};

export type TrustedAuthSession = TelegramTrustedAuthSession | ProviderTrustedSession<UserRole>;

export type AppAuthIdentity =
  | TrustedAuthSession
  | (DemoIdentityResolution & { source: DemoIdentityResolution["source"]; legacy: true });

type AuthIdentityLike = {
  user?: {
    userKey?: string | null;
    firstName?: string | null;
    username?: string | null;
  };
  userKey?: string | null;
  firstName?: string | null;
  username?: string | null;
};

export const readAuthUserKey = (identity: unknown) => {
  const auth = identity as AuthIdentityLike | null;
  return auth?.user?.userKey || auth?.userKey || null;
};

export const readAuthDisplayName = (identity: unknown) => {
  const auth = identity as AuthIdentityLike | null;
  return auth?.user?.firstName || auth?.user?.username || auth?.firstName || auth?.username || "GO IRL User";
};

let trustedSession: TrustedAuthSession | null = readTrustedSession();
let legacyIdentity: DemoIdentityResolution | null = null;
let authError: string | null = null;

function readTrustedSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(sessionStorageKey) || "null") as TrustedAuthSession | null;
    if (!parsed?.accessToken || !parsed.expiresAt || !parsed.user?.userKey) return null;
    if (parsed.source !== "trusted-telegram" && parsed.source !== "trusted-provider") return null;
    if (parsed.expiresAt <= Math.floor(Date.now() / 1000) + 60) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTrustedSession(session: TrustedAuthSession) {
  trustedSession = session;
  sessionStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

export function clearTrustedSession() {
  trustedSession = null;
  sessionStorage.removeItem(sessionStorageKey);
}

function resolveLegacyDemoIdentity() {
  if (!isDemoAuthEnabled()) return null;
  if (!legacyIdentity) {
    legacyIdentity = resolveDemoIdentity({
      telegramId: getTelegramWebApp()?.initDataUnsafe?.user?.id || (isBrowserMockAuthEnabled() ? browserMockTelegramId : undefined),
      storage: getIdentityStorage(),
      randomUUID: createIdentityUuid,
    });
  }
  return legacyIdentity;
}

async function performTrustedAuth(): Promise<AppAuthIdentity | null> {
  const initData = getTelegramInitData();
  const telegramSession = trustedSession?.source === "trusted-telegram" ? trustedSession : null;
  const liveStartParam = getTelegramWebApp()?.initDataUnsafe?.start_param;
  const liveRoleInvitationFingerprint = initData
    ? await fingerprintRoleInvitationStartParam(liveStartParam)
    : null;
  const hasUnprocessedRoleInvitation = initData && shouldProcessRoleInvitation(
    liveRoleInvitationFingerprint,
    telegramSession?.processedRoleInvitationFingerprint,
  );
  const trustedSessionIsFresh = Boolean(
    trustedSession && trustedSession.expiresAt > Math.floor(Date.now() / 1000) + 60,
  );
  const isWebAuthCallback = typeof window !== "undefined" && window.location.pathname === webAuthCallbackPath;

  if (isWebAuthCallback) {
    const webCallback = await completeWebAuthCallback(trustedSessionIsFresh ? trustedSession?.accessToken : null);
    if (webCallback.status === "success") {
      writeTrustedSession(webCallback.session);
      authError = null;
      window.history.replaceState({}, "", webCallback.returnTo);
      return webCallback.session;
    }
    if (webCallback.status === "linked" || webCallback.status === "already_linked") {
      writeAccountSecurityFeedback(window.sessionStorage, {
        status: webCallback.status,
        provider: webCallback.provider,
      });
      authError = null;
      window.history.replaceState({}, "", webCallback.returnTo);
      if (trustedSessionIsFresh && trustedSession) return trustedSession;
      authError = "link_session_required";
      return null;
    }
    if (webCallback.status === "error") {
      if (webCallback.mode === "link" && webCallback.provider) {
        writeAccountSecurityFeedback(window.sessionStorage, {
          status: "error",
          provider: webCallback.provider,
          error: webCallback.error,
        });
        if (webCallback.returnTo) window.history.replaceState({}, "", webCallback.returnTo);
        if (trustedSessionIsFresh && trustedSession) {
          authError = null;
          return trustedSession;
        }
      }
      if (webCallback.returnTo) window.history.replaceState({}, "", webCallback.returnTo);
      authError = webCallback.error;
      return null;
    }
  }

  if (
    trustedSessionIsFresh
    && trustedSession
    && ((!initData && trustedSession.source === "trusted-provider")
      || (initData && trustedSession.source === "trusted-telegram" && !hasUnprocessedRoleInvitation))
  ) {
    return trustedSession;
  }

  if (!initData) {
    const legacy = resolveLegacyDemoIdentity();
    if (legacy) return { ...legacy, legacy: true } as const;
    authError = "telegram_init_data_missing";
    return null;
  }

  if (!supabaseUrl || !publishableKey) {
    authError = "trusted_auth_env_missing";
    return null;
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/verifyTelegramInitData`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey,
      },
      body: JSON.stringify({ initData }),
    });

    const payload = await response.json() as {
      error?: string;
      session?: { access_token: string; expires_at: number };
      user?: TrustedAuthUser;
      startParam?: string;
      roleInvitation?: unknown;
    };

    if (!response.ok || !payload.session?.access_token || !payload.user) {
      authError = payload.error || "trusted_auth_failed";
      return null;
    }

    const roleInvitation = normalizeRoleInvitationResult(payload.roleInvitation);
    const session: TelegramTrustedAuthSession = {
      accessToken: payload.session.access_token,
      expiresAt: payload.session.expires_at,
      user: payload.user,
      startParam: payload.startParam,
      processedRoleInvitationFingerprint: roleInvitation
        ? liveRoleInvitationFingerprint
        : telegramSession?.processedRoleInvitationFingerprint,
      roleInvitation,
      source: "trusted-telegram",
    };
    writeTrustedSession(session);
    authError = null;
    return session;
  } catch {
    authError = "trusted_auth_unavailable";
    return null;
  }
}

const runTrustedAuth = createSingleFlight(performTrustedAuth);

export function initializeTrustedAuth() {
  return runTrustedAuth();
}

export function refreshTrustedAuth() {
  clearTrustedSession();
  return runTrustedAuth();
}

export const getTrustedAccessToken = async () => {
  if (trustedSession && trustedSession.expiresAt > Math.floor(Date.now() / 1000) + 60) {
    return trustedSession.accessToken;
  }

  const session = await initializeTrustedAuth();
  if (session && "accessToken" in session && (session.source === "trusted-telegram" || session.source === "trusted-provider")) {
    return session.accessToken;
  }
  return null;
};

export function isTrustedAuthReady() {
  return Boolean(trustedSession && trustedSession.expiresAt > Math.floor(Date.now() / 1000) + 60);
}

export function getCurrentAuthSession() {
  return trustedSession;
}

export function getCurrentAuthIdentity(): AppAuthIdentity | null {
  if (trustedSession) return trustedSession;
  const legacy = resolveLegacyDemoIdentity();
  return legacy ? { ...legacy, legacy: true } : null;
}

export function getCurrentUserKey() {
  return trustedSession?.user.userKey || resolveLegacyDemoIdentity()?.userKey || "unauthenticated";
}

export function getCurrentUserRole() {
  return trustedSession?.user.role || "user";
}

export function getCurrentStartParam() {
  return getTelegramWebApp()?.initDataUnsafe?.start_param
    || (trustedSession?.source === "trusted-telegram" ? trustedSession.startParam : undefined);
}

export function getCurrentRoleInvitationResult() {
  return trustedSession?.source === "trusted-telegram" ? trustedSession.roleInvitation || null : null;
}

export function getCurrentDisplayName(fallback: string) {
  const trustedUser = trustedSession?.user;
  if (trustedUser) {
    return [trustedUser.firstName, trustedUser.lastName].filter(Boolean).join(" ") || fallback;
  }

  if (isBrowserMockAuthEnabled()) return browserMockDisplayName;

  const telegramUser = isDemoAuthEnabled() ? getTelegramWebApp()?.initDataUnsafe?.user : null;
  return [telegramUser?.first_name, telegramUser?.last_name].filter(Boolean).join(" ") || fallback;
}

export function getAuthError() {
  return authError;
}

export function isLegacyDemoAuthEnabled() {
  return isDemoAuthEnabled();
}

export function isBrowserMockMode() {
  return isBrowserMockAuthEnabled() && !isTrustedAuthReady();
}
