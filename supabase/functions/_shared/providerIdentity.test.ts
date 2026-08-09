import { describe, expect, it } from "vitest";
import { readProviderSubject } from "./providerIdentity";

describe("AUTH002 provider identity minimum-data boundary", () => {
  it("reads only the immutable provider subject needed for account recognition", () => {
    expect(readProviderSubject([
      { provider: "google", provider_id: "google-sub", identity_data: { email: "not-used@example.test" } },
    ], "google")).toBe("google-sub");
  });

  it("uses provider metadata only as a subject fallback and never returns profile fields", () => {
    expect(readProviderSubject([
      { provider: "google", identity_data: { sub: "google-sub", email: "ignored@example.test", name: "Ignored" } },
      { provider: "facebook", identity_data: { id: "facebook-id", email: "ignored@example.test" } },
    ], "facebook")).toBe("facebook-id");
  });
});
