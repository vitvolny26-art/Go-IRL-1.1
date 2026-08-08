import { describe, expect, it } from "vitest";
import { isWebAuthProviderEnabled, webAuthVerifierFunctionName } from "./googleWebAuth";

describe("web provider runtime mapping", () => {
  it("routes each supported web provider to its dedicated trusted-session verifier", () => {
    expect(webAuthVerifierFunctionName("google")).toBe("verifyGoogleSession");
    expect(webAuthVerifierFunctionName("facebook")).toBe("verifyFacebookSession");
  });

  it("keeps Facebook fail-closed until the release flag is explicitly enabled", () => {
    expect(isWebAuthProviderEnabled("google", false)).toBe(true);
    expect(isWebAuthProviderEnabled("facebook", false)).toBe(false);
    expect(isWebAuthProviderEnabled("facebook", true)).toBe(true);
  });
});
