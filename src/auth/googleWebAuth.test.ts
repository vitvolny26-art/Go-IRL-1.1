import { describe, expect, it, vi } from "vitest";
import {
  isWebAuthProviderEnabled,
  resolveGoIrlLinkAccessToken,
  webAuthVerifierFunctionName,
} from "./googleWebAuth";

describe("web provider runtime", () => {
  it("routes providers to their bounded verification functions", () => {
    expect(webAuthVerifierFunctionName("google")).toBe("verifyGoogleSession");
    expect(webAuthVerifierFunctionName("facebook")).toBe("verifyFacebookSession");
  });

  it("keeps Facebook fail-closed until the release flag is explicitly enabled", () => {
    expect(isWebAuthProviderEnabled("google", false)).toBe(true);
    expect(isWebAuthProviderEnabled("facebook", false)).toBe(false);
    expect(isWebAuthProviderEnabled("facebook", true)).toBe(true);
  });
  it("recovers the GO IRL token only when a link callback lost its session-scoped token", async () => {
    const recover = vi.fn(async () => " recovered-token ");
    await expect(resolveGoIrlLinkAccessToken(" current-token ", recover)).resolves.toBe("current-token");
    expect(recover).not.toHaveBeenCalled();

    await expect(resolveGoIrlLinkAccessToken(null, recover)).resolves.toBe("recovered-token");
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("fails closed when link-session recovery is unavailable", async () => {
    await expect(resolveGoIrlLinkAccessToken(null)).resolves.toBeNull();
    await expect(resolveGoIrlLinkAccessToken(null, async () => {
      throw new Error("offline");
    })).resolves.toBeNull();
  });
});
