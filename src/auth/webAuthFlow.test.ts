import { describe, expect, it } from "vitest";
import {
  clearWebAuthRedirectContinuity,
  consumeWebAuthResumeIntent,
  createWebAuthRedirectStorage,
  createFacebookWebAuthStartRequest,
  createGoogleWebAuthStartRequest,
  parseWebAuthCallback,
  shouldPersistWebAuthRedirectState,
  storeWebAuthResumeIntent,
  webAuthCallbackPath,
  webAuthResumeStorageKey,
  webAuthResumeTtlMs,
} from "./webAuthFlow";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

const activityId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";

describe("web auth flow contract", () => {
  it("preserves same-origin protected intent and attribution through Google auth", () => {
    const request = createGoogleWebAuthStartRequest(
      `https://go-irl.fun/e/${activityId}?source=instagram&campaign=pilot#join`,
      "https://go-irl.fun",
    );
    expect(request).toEqual({
      provider: "google",
      mode: "sign-in",
      redirectTo: `https://go-irl.fun${webAuthCallbackPath}`,
      returnTo: `/e/${activityId}?source=instagram&campaign=pilot#join`,
      activityIntent: { activityId, action: "join", route: "event" },
    });
  });

  it("uses the same protected-intent contract for Facebook auth", () => {
    expect(createFacebookWebAuthStartRequest(
      `https://go-irl.fun/e/${activityId}?source=facebook#request_to_join`,
      "https://go-irl.fun",
    )).toEqual({
      provider: "facebook",
      mode: "sign-in",
      redirectTo: `https://go-irl.fun${webAuthCallbackPath}`,
      returnTo: `/e/${activityId}?source=facebook#request_to_join`,
      activityIntent: { activityId, action: "request_to_join", route: "event" },
    });
  });

  it("fails closed to root for cross-origin or callback-loop return targets", () => {
    expect(createGoogleWebAuthStartRequest("https://evil.example/phish", "https://go-irl.fun").returnTo).toBe("/");
    expect(createGoogleWebAuthStartRequest("https://go-irl.fun/auth/callback?code=x", "https://go-irl.fun").returnTo).toBe("/");
  });

  it("uses persistent redirect continuity only for real Telegram launch evidence", () => {
    expect(shouldPersistWebAuthRedirectState("query_id=telegram-proof", "/profile/security")).toBe(true);
    expect(shouldPersistWebAuthRedirectState("", "/profile/security")).toBe(false);
    expect(shouldPersistWebAuthRedirectState("query_id=telegram-proof", webAuthCallbackPath)).toBe(false);
  });

  it("recovers TMA PKCE and resume state after sessionStorage is recreated", () => {
    const beforeRedirectSession = memoryStorage();
    const persistent = memoryStorage();
    const beforeRedirect = createWebAuthRedirectStorage(beforeRedirectSession, persistent, true, 1000);
    beforeRedirect.setItem("supabase-code-verifier", "pkce-verifier");
    beforeRedirect.setItem(webAuthResumeStorageKey, "resume-intent");

    const callbackSession = memoryStorage();
    const callback = createWebAuthRedirectStorage(callbackSession, persistent, false, 1001);
    expect(callback.getItem("supabase-code-verifier")).toBe("pkce-verifier");
    expect(callback.getItem(webAuthResumeStorageKey)).toBe("resume-intent");

    callback.removeItem("supabase-code-verifier");
    callback.removeItem(webAuthResumeStorageKey);
    clearWebAuthRedirectContinuity(persistent);
    expect(callback.getItem("supabase-code-verifier")).toBeNull();
    expect(callback.getItem(webAuthResumeStorageKey)).toBeNull();
  });

  it("keeps ordinary browser auth state session-scoped", () => {
    const browserSession = memoryStorage();
    const persistent = memoryStorage();
    const browser = createWebAuthRedirectStorage(browserSession, persistent, false, 1000);
    browser.setItem("supabase-code-verifier", "pkce-verifier");

    const newSession = createWebAuthRedirectStorage(memoryStorage(), persistent, false, 1001);
    expect(newSession.getItem("supabase-code-verifier")).toBeNull();
  });

  it("expires abandoned TMA redirect continuity with the resume TTL", () => {
    const persistent = memoryStorage();
    const beforeRedirect = createWebAuthRedirectStorage(memoryStorage(), persistent, true, 1000);
    beforeRedirect.setItem("supabase-code-verifier", "pkce-verifier");

    const staleCallback = createWebAuthRedirectStorage(
      memoryStorage(),
      persistent,
      false,
      1000 + webAuthResumeTtlMs + 1,
    );
    expect(staleCallback.getItem("supabase-code-verifier")).toBeNull();
  });

  it("stores a short-lived one-time resume intent without OAuth code or token material", () => {
    const storage = memoryStorage();
    const request = createGoogleWebAuthStartRequest("https://go-irl.fun/activities?city=olomouc", "https://go-irl.fun");
    storeWebAuthResumeIntent(storage, request, 1000);
    const raw = storage.getItem(webAuthResumeStorageKey) || "";
    expect(raw).not.toContain("access_token");
    expect(raw).not.toContain("code=");

    expect(consumeWebAuthResumeIntent(storage, "https://go-irl.fun", 1001)).toMatchObject({
      provider: "google",
      returnTo: "/activities?city=olomouc",
    });
    expect(consumeWebAuthResumeIntent(storage, "https://go-irl.fun", 1002)).toBeNull();
  });

  it("round-trips a one-time Facebook resume intent", () => {
    const storage = memoryStorage();
    const request = createFacebookWebAuthStartRequest("https://go-irl.fun/profile/security", "https://go-irl.fun");
    storeWebAuthResumeIntent(storage, request, 1000);
    expect(consumeWebAuthResumeIntent(storage, "https://go-irl.fun", 1001)).toMatchObject({
      provider: "facebook",
      returnTo: "/profile/security",
    });
  });

  it("round-trips semantic event intent and rejects mismatched stored metadata", () => {
    const storage = memoryStorage();
    const request = createGoogleWebAuthStartRequest(
      `https://go-irl.fun/e/${activityId}?source=instagram#join`,
      "https://go-irl.fun",
    );
    storeWebAuthResumeIntent(storage, request, 1000);
    expect(consumeWebAuthResumeIntent(storage, "https://go-irl.fun", 1001)?.activityIntent).toEqual({
      activityId,
      action: "join",
      route: "event",
    });

    storage.setItem(webAuthResumeStorageKey, JSON.stringify({
      provider: "google",
      mode: "sign-in",
      returnTo: `/e/${activityId}#join`,
      activityIntent: { activityId, action: "request_to_join", route: "event" },
      createdAt: 1000,
    }));
    expect(consumeWebAuthResumeIntent(storage, "https://go-irl.fun", 1001)).toBeNull();
  });

  it("round-trips a link intent without token material", () => {
    const storage = memoryStorage();
    const request = createFacebookWebAuthStartRequest(
      "https://go-irl.fun/profile/security",
      "https://go-irl.fun",
      "link",
    );
    storeWebAuthResumeIntent(storage, request, 1000);
    const raw = storage.getItem(webAuthResumeStorageKey) || "";
    expect(raw).not.toContain("access_token");
    expect(raw).not.toContain("Bearer ");
    expect(consumeWebAuthResumeIntent(storage, "https://go-irl.fun", 1001)).toMatchObject({
      provider: "facebook",
      mode: "link",
      returnTo: "/profile/security",
    });
  });

  it("treats legacy resume intents without mode as sign-in", () => {
    const storage = memoryStorage();
    storage.setItem(webAuthResumeStorageKey, JSON.stringify({
      provider: "google",
      returnTo: "/activities",
      createdAt: 1000,
    }));
    expect(consumeWebAuthResumeIntent(storage, "https://go-irl.fun", 1001)).toMatchObject({
      provider: "google",
      mode: "sign-in",
    });
  });

  it("expires stale resume intent", () => {
    const storage = memoryStorage();
    const request = createGoogleWebAuthStartRequest("https://go-irl.fun/activities", "https://go-irl.fun");
    storeWebAuthResumeIntent(storage, request, 1000);
    expect(consumeWebAuthResumeIntent(storage, "https://go-irl.fun", 1000 + webAuthResumeTtlMs + 1)).toBeNull();
  });

  it("accepts only the same-origin PKCE callback shape and sanitizes provider errors", () => {
    expect(parseWebAuthCallback("https://go-irl.fun/auth/callback?code=pkce-code", "https://go-irl.fun"))
      .toEqual({ status: "code", code: "pkce-code" });
    expect(parseWebAuthCallback("https://evil.example/auth/callback?code=pkce-code", "https://go-irl.fun"))
      .toEqual({ status: "invalid_callback" });
    expect(parseWebAuthCallback("https://go-irl.fun/auth/callback?error=access denied<script>", "https://go-irl.fun"))
      .toEqual({ status: "provider_error", error: "access_denied_script_" });
  });
});
