import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("AUTH002 Facebook minimum-data boundary", () => {
  it("validates the transient provider session before reading the Facebook subject", () => {
    const getUser = edgeSource.indexOf("supabase.auth.getUser(accessToken)");
    const facebookIdentity = edgeSource.indexOf('readProviderSubject(authResult.data.user.identities, "facebook")', getUser);
    expect(getUser).toBeGreaterThan(-1);
    expect(facebookIdentity).toBeGreaterThan(getUser);
  });

  it("does not import Facebook profile fields or email into GO IRL auth state", () => {
    expect(edgeSource).not.toContain("user_metadata");
    expect(edgeSource).not.toContain("first_name:");
    expect(edgeSource).not.toContain("last_name:");
    expect(edgeSource).not.toContain("language_code:");
    expect(edgeSource).not.toContain("authResult.data.user.email");
  });

  it("keeps the provider subject server-side and uses an opaque GO IRL user key for new users", () => {
    expect(edgeSource).toContain("provider_user_id: providerUserId");
    expect(edgeSource).toContain('const userKey = `user:${crypto.randomUUID()}`');
    expect(edgeSource).not.toContain('const userKey = `facebook:${providerUserId}`');
  });

  it("does not expose the Facebook subject or provider profile in GO IRL JWT/browser payload", () => {
    expect(edgeSource).not.toContain("go_irl_provider_user_id");
    expect(edgeSource).toMatch(/user:\s*\{\s*id: appUser\.id,\s*userKey: appUser\.user_key,\s*provider: "facebook",\s*role,\s*\}/s);
  });
});
