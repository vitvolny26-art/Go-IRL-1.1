/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { linkedProviderDisplayLabel } from "./auth/accountSecurity";

const migration = readFileSync(new URL("../supabase/migrations/20260821122826_linked_identity_display_metadata.sql", import.meta.url), "utf8");
const linkProviderIdentity = readFileSync(new URL("../supabase/functions/linkProviderIdentity/index.ts", import.meta.url), "utf8");
const googleSession = readFileSync(new URL("../supabase/functions/verifyGoogleSession/index.ts", import.meta.url), "utf8");
const facebookSession = readFileSync(new URL("../supabase/functions/verifyFacebookSession/index.ts", import.meta.url), "utf8");
const telegramSession = readFileSync(new URL("../supabase/functions/verifyTelegramInitData/index.ts", import.meta.url), "utf8");

describe("linked identity display metadata", () => {
  it("formats concrete provider accounts without exposing immutable provider ids", () => {
    expect(linkedProviderDisplayLabel({ provider: "telegram", status: "active", provider_username: "vit_solo" })).toBe("@vit_solo");
    expect(linkedProviderDisplayLabel({ provider: "google", status: "active", provider_email: "user@example.com" })).toBe("user@example.com");
    expect(linkedProviderDisplayLabel({ provider: "facebook", status: "active", provider_display_name: "Vit Solo", provider_email: "vit@example.com" })).toBe("Vit Solo");
  });

  it("adds display-only columns and keeps provider_user_id internal", () => {
    expect(migration).toContain("add column if not exists provider_username text");
    expect(migration).toContain("add column if not exists provider_email text");
    expect(migration).toContain("add column if not exists provider_display_name text");
    expect(migration).toContain("Never used for authorization or automatic account matching");
    expect(linkProviderIdentity).toContain('.select("provider,status,provider_username,provider_email,provider_display_name")');
    expect(linkProviderIdentity).not.toContain('.select("provider,status,provider_user_id")');
  });

  it("refreshes metadata only from verified provider-session paths", () => {
    expect(googleSession).toContain('readProviderDisplayMetadata(authUser, "google")');
    expect(facebookSession).toContain('readProviderDisplayMetadata(authResult.data.user, "facebook")');
    expect(linkProviderIdentity).toContain("persistDisplayMetadata");
    expect(telegramSession).toContain("provider_username: verified.user.username?.trim().toLowerCase() || null");
    expect(telegramSession).toContain("provider_display_name: [verified.user.first_name, verified.user.last_name]");
  });
});
