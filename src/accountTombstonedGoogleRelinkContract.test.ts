/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const linkProviderIdentity = readFileSync(
  new URL("../supabase/functions/linkProviderIdentity/index.ts", import.meta.url),
  "utf8",
);
const verifyGoogleSession = readFileSync(
  new URL("../supabase/functions/verifyGoogleSession/index.ts", import.meta.url),
  "utf8",
);

describe("tombstoned Google explicit relink contract", () => {
  it("allows a tombstoned Google subject only through an explicit link action", () => {
    expect(linkProviderIdentity).toContain(
      'const canRelinkDeletedGoogle = body.action === "link" && provider === "google";',
    );
    expect(linkProviderIdentity).toContain(
      'if (deletedIdentityResult.data && !canRelinkDeletedGoogle) return json({ error: "account_deleted" }, 410);',
    );
  });

  it("keeps standalone tombstoned Google bootstrap blocked without an active binding", () => {
    expect(verifyGoogleSession).toContain('.select("user_key,status")');
    expect(verifyGoogleSession).toContain('linkedIdentity?.status !== "active"');
    expect(verifyGoogleSession).toContain('return json({ error: "account_deleted" }, 410);');
  });

  it("checks the durable provider binding before applying the tombstone bootstrap guard", () => {
    const bindingLookup = verifyGoogleSession.indexOf('.from("user_provider_identities")');
    const tombstoneLookup = verifyGoogleSession.indexOf('.from("deleted_provider_identities")');
    expect(bindingLookup).toBeGreaterThan(-1);
    expect(tombstoneLookup).toBeGreaterThan(bindingLookup);
  });

  it("reuses the linked GO IRL user before any new account bootstrap", () => {
    const linkedPath = verifyGoogleSession.indexOf("if (linkedIdentity?.user_key)");
    const bootstrapPath = verifyGoogleSession.indexOf('const userKey = `user:${crypto.randomUUID()}`;');
    expect(linkedPath).toBeGreaterThan(-1);
    expect(bootstrapPath).toBeGreaterThan(linkedPath);
  });

  it("preserves role resolution from the reused GO IRL user", () => {
    expect(verifyGoogleSession).toContain('.eq("user_key", appUser.user_key)');
    expect(verifyGoogleSession).toContain('go_irl_role: role');
  });

  it("does not remove the self-delete tombstone as part of linking", () => {
    expect(linkProviderIdentity).not.toContain('.delete().eq("subject_hash"');
    expect(linkProviderIdentity).not.toContain('delete from deleted_provider_identities');
  });
});
