import {
  resolveActivityEntryIntentFromUrl,
  type ActivityEntryIntent,
} from "./activityEntryIntent";

export const webAuthCallbackPath = "/auth/callback";
export const webAuthResumeStorageKey = "go-irl-web-auth-resume-v1";
export const webAuthResumeTtlMs = 15 * 60 * 1000;

export type WebAuthProvider = "google" | "facebook";
export type WebAuthMode = "sign-in" | "link" | "transfer";

export type WebAuthResumeIntent = {
  provider: WebAuthProvider;
  mode: WebAuthMode;
  returnTo: string;
  activityIntent?: ActivityEntryIntent;
  createdAt: number;
};

export type WebAuthStartRequest = {
  provider: WebAuthProvider;
  mode: WebAuthMode;
  redirectTo: string;
  returnTo: string;
  queryParams?: Record<string, string>;
  activityIntent?: ActivityEntryIntent;
};

export type WebAuthCallbackResult =
  | { status: "code"; code: string }
  | { status: "provider_error"; error: string }
  | { status: "invalid_callback" };

export type WebAuthStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const webAuthRedirectPersistenceKey = "go-irl-web-auth-redirect-v1";
const webAuthRedirectStoragePrefix = "go-irl-web-auth-redirect-v1:";

const readPersistentStorage = (storage: WebAuthStorageLike, key: string) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writePersistentStorage = (storage: WebAuthStorageLike, key: string, value: string) => {
  try {
    storage.setItem(key, value);
  } catch {
    // Session storage remains the fallback when persistent WebView storage is unavailable.
  }
};

const removePersistentStorage = (storage: WebAuthStorageLike, key: string) => {
  try {
    storage.removeItem(key);
  } catch {
    // Best-effort cleanup only.
  }
};

export const shouldPersistWebAuthRedirectState = (telegramInitData: string, pathname: string) =>
  Boolean(telegramInitData.trim()) && pathname !== webAuthCallbackPath;

export function createWebAuthRedirectStorage(
  sessionStorage: WebAuthStorageLike,
  persistentStorage: WebAuthStorageLike,
  persistAcrossRedirect: boolean,
  nowMs = Date.now(),
): WebAuthStorageLike {
  if (persistAcrossRedirect) {
    writePersistentStorage(
      persistentStorage,
      webAuthRedirectPersistenceKey,
      JSON.stringify({ createdAt: nowMs }),
    );
  }

  const hasLivePersistentRedirect = () => {
    const raw = readPersistentStorage(persistentStorage, webAuthRedirectPersistenceKey);
    if (!raw) return false;
    try {
      const value = JSON.parse(raw) as { createdAt?: unknown };
      const isLive = typeof value.createdAt === "number"
        && Number.isFinite(value.createdAt)
        && nowMs - value.createdAt >= 0
        && nowMs - value.createdAt <= webAuthResumeTtlMs;
      if (!isLive) removePersistentStorage(persistentStorage, webAuthRedirectPersistenceKey);
      return isLive;
    } catch {
      return false;
    }
  };

  const persistentKey = (key: string) => `${webAuthRedirectStoragePrefix}${key}`;

  return {
    getItem: (key) => sessionStorage.getItem(key)
      ?? (hasLivePersistentRedirect() ? readPersistentStorage(persistentStorage, persistentKey(key)) : null),
    setItem: (key, value) => {
      sessionStorage.setItem(key, value);
      if (persistAcrossRedirect) writePersistentStorage(persistentStorage, persistentKey(key), value);
    },
    removeItem: (key) => {
      sessionStorage.removeItem(key);
      removePersistentStorage(persistentStorage, persistentKey(key));
    },
  };
}

export const clearWebAuthRedirectContinuity = (persistentStorage: WebAuthStorageLike) =>
  removePersistentStorage(persistentStorage, webAuthRedirectPersistenceKey);

const normalizeOrigin = (origin: string) => new URL(origin).origin;

const isAllowedProtocol = (url: URL) =>
  url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));

export function normalizeWebAuthReturnTo(candidate: string, applicationOrigin: string) {
  const origin = normalizeOrigin(applicationOrigin);
  const url = new URL(candidate, origin);
  if (!isAllowedProtocol(url) || url.origin !== origin || url.pathname === webAuthCallbackPath) return "/";
  return `${url.pathname}${url.search}${url.hash}` || "/";
}

export function createWebAuthStartRequest(
  provider: WebAuthProvider,
  currentUrl: string,
  applicationOrigin: string,
  mode: WebAuthMode = "sign-in",
): WebAuthStartRequest {
  const origin = normalizeOrigin(applicationOrigin);
  const returnTo = normalizeWebAuthReturnTo(currentUrl, origin);
  const queryParams = provider === "google" && mode === "transfer"
    ? { prompt: "select_account" }
    : undefined;
  const activityIntent = resolveActivityEntryIntentFromUrl(returnTo, origin);
  return {
    provider,
    mode,
    redirectTo: `${origin}${webAuthCallbackPath}`,
    returnTo,
    ...(queryParams ? { queryParams } : {}),
    ...(activityIntent ? { activityIntent } : {}),
  };
}

export const createGoogleWebAuthStartRequest = (currentUrl: string, applicationOrigin: string, mode: WebAuthMode = "sign-in") =>
  createWebAuthStartRequest("google", currentUrl, applicationOrigin, mode);

export const createFacebookWebAuthStartRequest = (currentUrl: string, applicationOrigin: string, mode: WebAuthMode = "sign-in") =>
  createWebAuthStartRequest("facebook", currentUrl, applicationOrigin, mode);

export function storeWebAuthResumeIntent(
  storage: WebAuthStorageLike,
  request: WebAuthStartRequest,
  nowMs = Date.now(),
) {
  const intent: WebAuthResumeIntent = {
    provider: request.provider,
    mode: request.mode,
    returnTo: request.returnTo,
    ...(request.activityIntent ? { activityIntent: request.activityIntent } : {}),
    createdAt: nowMs,
  };
  storage.setItem(webAuthResumeStorageKey, JSON.stringify(intent));
}

export function consumeWebAuthResumeIntent(
  storage: WebAuthStorageLike,
  applicationOrigin: string,
  nowMs = Date.now(),
): WebAuthResumeIntent | null {
  const raw = storage.getItem(webAuthResumeStorageKey);
  storage.removeItem(webAuthResumeStorageKey);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<WebAuthResumeIntent>;
    if ((value.provider !== "google" && value.provider !== "facebook")
      || (value.mode !== undefined && value.mode !== "sign-in" && value.mode !== "link" && value.mode !== "transfer")
      || typeof value.returnTo !== "string"
      || typeof value.createdAt !== "number") {
      return null;
    }
    const mode: WebAuthMode = value.mode === "link" || value.mode === "transfer" ? value.mode : "sign-in";
    if (!Number.isFinite(value.createdAt) || nowMs - value.createdAt < 0 || nowMs - value.createdAt > webAuthResumeTtlMs) {
      return null;
    }
    const returnTo = normalizeWebAuthReturnTo(value.returnTo, applicationOrigin);
    const activityIntent = resolveActivityEntryIntentFromUrl(returnTo, applicationOrigin);
    if (value.activityIntent !== undefined && (
      !activityIntent
      || value.activityIntent.activityId !== activityIntent.activityId
      || value.activityIntent.action !== activityIntent.action
      || value.activityIntent.route !== activityIntent.route
    )) {
      return null;
    }
    return {
      provider: value.provider,
      mode,
      returnTo,
      ...(activityIntent ? { activityIntent } : {}),
      createdAt: value.createdAt,
    };
  } catch {
    return null;
  }
}

const sanitizeProviderError = (value: string | null) => {
  if (!value) return "oauth_provider_error";
  const sanitized = value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);
  return sanitized || "oauth_provider_error";
};

export function parseWebAuthCallback(
  callbackUrl: string,
  applicationOrigin: string,
): WebAuthCallbackResult {
  const origin = normalizeOrigin(applicationOrigin);
  const url = new URL(callbackUrl, origin);
  if (!isAllowedProtocol(url) || url.origin !== origin || url.pathname !== webAuthCallbackPath) {
    return { status: "invalid_callback" };
  }

  const providerError = url.searchParams.get("error");
  if (providerError) {
    return { status: "provider_error", error: sanitizeProviderError(providerError) };
  }

  const code = url.searchParams.get("code")?.trim();
  if (!code) return { status: "invalid_callback" };
  return { status: "code", code };
}
