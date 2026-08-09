import { describe, expect, it } from "vitest";
import { supportsTrustedCoreAccess } from "./trustedCoreAccess";

describe("trusted core access", () => {
  it("accepts verified Telegram and web-provider identities", () => {
    expect(supportsTrustedCoreAccess({ source: "trusted-telegram" })).toBe(true);
    expect(supportsTrustedCoreAccess({ source: "trusted-provider" })).toBe(true);
  });

  it("rejects demo, missing, and unknown identities", () => {
    expect(supportsTrustedCoreAccess({ source: "guest-local-storage" })).toBe(false);
    expect(supportsTrustedCoreAccess({ source: "trusted-preview-bot" })).toBe(false);
    expect(supportsTrustedCoreAccess(null)).toBe(false);
  });
});
