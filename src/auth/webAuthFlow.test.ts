import { describe, expect, it } from "vitest";
import {
  consumeWebAuthResumeIntent,
  createFacebookWebAuthStartRequest,
  createGoogleWebAuthStartRequest,
  parseWebAuthCallback,
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

describe("web auth flow contract", () => {
  it("preserves same-origin protected intent and attribution through Google auth", () => {
    const request = createGoogleWebAuthStartRequest(
      "https://go-irl.fun/e/abc?source=instagram&campaign=pilot#join",
      "https://go-irl.fun",
    );
    expect(request).toEqual({
      provider: "google",
      redirectTo: `https://go-irl.fun${webAuthCallbackPath}`,
      returnTo: "/e/abc?source=instagram&campaign=pilot#join",
    });
  });

  it("uses the same protected-intent contract for Facebook auth", () => {
    expect(createFacebookWebAuthStartRequest(
      "https://go-irl.fun/e/abc?source=facebook#join",
      "https://go-irl.fun",
    )).toEqual({
      provider: "facebook",
      redirectTo: `https://go-irl.fun${webAuthCallbackPath}`,
      returnTo: "/e/abc?source=facebook#join",
    });
  });

  it("fails closed to root for cross-origin or callback-loop return targets", () => {
    expect(createGoogleWebAuthStartRequest("https://evil.example/phish", "https://go-irl.fun").returnTo).toBe("/");
    expect(createGoogleWebAuthStartRequest("https://go-irl.fun/auth/callback?code=x", "https://go-irl.fun").returnTo).toBe("/");
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
