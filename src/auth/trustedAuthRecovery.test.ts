/// <reference types="node" />

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTrustedAuthRecovery,
  runTrustedAuthWithTimeout,
  trustedAuthRequestTimeoutMs,
  trustedAuthRetryCooldownMs,
} from "./trustedAuthRecovery";

const authSession = readFileSync(new URL("../authSession.ts", import.meta.url), "utf8");

afterEach(() => {
  vi.useRealTimers();
});

describe("trusted Telegram auth recovery", () => {
  it("bounds an unresolved auth operation instead of leaving bootstrap pending", async () => {
    vi.useFakeTimers();
    const request = runTrustedAuthWithTimeout(
      () => new Promise(() => {}),
      trustedAuthRequestTimeoutMs,
    );
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });

    await vi.advanceTimersByTimeAsync(trustedAuthRequestTimeoutMs);
    await rejection;
  });

  it("aborts the in-flight auth transport when the bound expires", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const request = runTrustedAuthWithTimeout((signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("The operation was aborted", "AbortError"));
      }, { once: true });
    }), trustedAuthRequestTimeoutMs);
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });

    await vi.advanceTimersByTimeAsync(trustedAuthRequestTimeoutMs);
    await rejection;
    expect(aborted).toBe(true);
  });

  it("suppresses automatic retry storms until the cooldown expires", () => {
    let now = 1_000;
    const recovery = createTrustedAuthRecovery(() => now, trustedAuthRetryCooldownMs);

    expect(recovery.canAttempt()).toBe(true);
    recovery.markUnavailable();
    expect(recovery.canAttempt()).toBe(false);

    now += trustedAuthRetryCooldownMs - 1;
    expect(recovery.canAttempt()).toBe(false);
    now += 1;
    expect(recovery.canAttempt()).toBe(true);
  });

  it("allows explicit refresh and successful auth to clear the cooldown", () => {
    const recovery = createTrustedAuthRecovery(() => 1_000, trustedAuthRetryCooldownMs);

    recovery.markUnavailable();
    expect(recovery.canAttempt()).toBe(false);
    recovery.reset();
    expect(recovery.canAttempt()).toBe(true);

    recovery.markUnavailable();
    recovery.markAvailable();
    expect(recovery.canAttempt()).toBe(true);
  });

  it("keeps the authSession integration bounded and manual-refresh recoverable", () => {
    expect(authSession).toContain('import { createTrustedAuthRecovery, runTrustedAuthWithTimeout } from "./auth/trustedAuthRecovery"');
    expect(authSession).toContain("const trustedAuthRecovery = createTrustedAuthRecovery()");
    expect(authSession).toContain("if (!trustedAuthRecovery.canAttempt())");
    expect(authSession).toContain("const { response, payload } = await runTrustedAuthWithTimeout(async (signal) => {");
    expect(authSession).toContain("trustedAuthRecovery.markUnavailable()");
    expect(authSession).toContain("trustedAuthRecovery.markAvailable()");
    expect(authSession).toContain("trustedAuthRecovery.reset();\n  clearTrustedSession();");
  });
});
