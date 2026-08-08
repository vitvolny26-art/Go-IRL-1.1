export const webAuthCallbackPath = "/auth/callback";
export const webAuthResumeStorageKey = "go-irl-web-auth-resume-v1";
export const webAuthResumeTtlMs = 15 * 60 * 1000;

export type WebAuthProvider = "google" | "facebook";

export type WebAuthResumeIntent = {
  provider: WebAuthProvider;
  returnTo: string;
  createdAt: number;
};

export type WebAuthStartRequest = {
  provider: WebAuthProvider;
  redirectTo: string;
  returnTo: string;
};

export type WebAuthCallbackResult =
  | { status: "code"; code: string }
  | { status: "provider_error"; error: string }
  | { status: "invalid_callback" };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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
): WebAuthStartRequest {
  const origin = normalizeOrigin(applicationOrigin);
  return {
    provider,
    redirectTo: `${origin}${webAuthCallbackPath}`,
    returnTo: normalizeWebAuthReturnTo(currentUrl, origin),
  };
}

export const createGoogleWebAuthStartRequest = (currentUrl: string, applicationOrigin: string) =>
  createWebAuthStartRequest("google", currentUrl, applicationOrigin);

export const createFacebookWebAuthStartRequest = (currentUrl: string, applicationOrigin: string) =>
  createWebAuthStartRequest("facebook", currentUrl, applicationOrigin);

export function storeWebAuthResumeIntent(
  storage: StorageLike,
  request: WebAuthStartRequest,
  nowMs = Date.now(),
) {
  const intent: WebAuthResumeIntent = {
    provider: request.provider,
    returnTo: request.returnTo,
    createdAt: nowMs,
  };
  storage.setItem(webAuthResumeStorageKey, JSON.stringify(intent));
}

export function consumeWebAuthResumeIntent(
  storage: StorageLike,
  applicationOrigin: string,
  nowMs = Date.now(),
): WebAuthResumeIntent | null {
  const raw = storage.getItem(webAuthResumeStorageKey);
  storage.removeItem(webAuthResumeStorageKey);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<WebAuthResumeIntent>;
    if ((value.provider !== "google" && value.provider !== "facebook")
      || typeof value.returnTo !== "string"
      || typeof value.createdAt !== "number") {
      return null;
    }
    if (!Number.isFinite(value.createdAt) || nowMs - value.createdAt < 0 || nowMs - value.createdAt > webAuthResumeTtlMs) {
      return null;
    }
    return {
      provider: value.provider,
      returnTo: normalizeWebAuthReturnTo(value.returnTo, applicationOrigin),
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
