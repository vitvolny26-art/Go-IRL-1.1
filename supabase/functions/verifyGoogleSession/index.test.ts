import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("AUTH002 Google minimum-data boundary", () => {
  it("validates the Supabase bearer before reading Google identity or writing GO IRL identity state", () => {
    const getUser = edgeSource.indexOf("supabase.auth.getUser(accessToken)");
    const googleIdentity = edgeSource.indexOf('readProviderSubject(authUser.identities, "google")', getUser);
    const appUserWrite = edgeSource.indexOf('.from("app_users").insert', googleIdentity);
    expect(getUser).toBeGreaterThan(-1);
    expect(googleIdentity).toBeGreaterThan(getUser);
    expect(appUserWrite).toBeGreaterThan(googleIdentity);
  });

  it("never links by email and does not import provider profile metadata", () => {
    expect(edgeSource).not.toMatch(/\.eq\(\s*["']email["']/);
    expect(edgeSource).not.toContain("authUser.email");
    expect(edgeSource).not.toContain("user_metadata");
    expect(edgeSource).not.toContain("first_name:");
    expect(edgeSource).not.toContain("last_name:");
    expect(edgeSource).not.toContain("language_code:");
  });

  it("keeps the provider subject server-side and uses an opaque GO IRL user key for new users", () => {
    expect(edgeSource).toContain("provider_user_id: providerUserId");
    expect(edgeSource).toContain('const userKey = `user:${crypto.randomUUID()}`');
    expect(edgeSource).not.toContain('const userKey = `google:${providerUserId}`');
  });

  it("does not place the Google subject or provider profile in GO IRL JWT/browser payload", () => {
    expect(edgeSource).toContain('go_irl_user_key: appUser.user_key');
    expect(edgeSource).toContain('go_irl_auth_provider: "google"');
    expect(edgeSource).toContain("go_irl_role: role");
    expect(edgeSource).not.toContain("go_irl_provider_user_id");
    expect(edgeSource).toMatch(/user:\s*\{\s*id: appUser\.id,\s*userKey: appUser\.user_key,\s*provider: "google",\s*role,\s*\}/s);
  });

  it("keeps provider failures sanitized", () => {
    expect(edgeSource).toContain('return json({ error: "access_denied" }, 401)');
    expect(edgeSource).toContain('return json({ error: "google_identity_required" }, 403)');
    expect(edgeSource).toContain('return json({ error: "verification_failed" }, 500)');
    expect(edgeSource).not.toContain("error.message");
  });
});
