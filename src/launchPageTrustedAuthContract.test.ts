/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const launchPage = readFileSync(new URL("./LaunchPage.tsx", import.meta.url), "utf8");
const authSession = readFileSync(new URL("./authSession.ts", import.meta.url), "utf8");

describe("LaunchPage trusted auth contract", () => {
  it("hides the web auth CTA when a valid trusted session is already ready", () => {
    expect(launchPage).toContain('import { isTrustedAuthReady } from "./authSession"');
    expect(launchPage).toContain('const showWebAuth = typeof window !== "undefined" && !getTelegramInitData() && !isTrustedAuthReady()');
  });

  it("keeps trusted-session readiness TTL-gated and provider-neutral", () => {
    expect(authSession).toContain('parsed.source !== "trusted-telegram" && parsed.source !== "trusted-provider"');
    expect(authSession).toContain('parsed.expiresAt <= Math.floor(Date.now() / 1000) + 60');
    expect(authSession).toContain('trustedSession && trustedSession.expiresAt > Math.floor(Date.now() / 1000) + 60');
  });
});
