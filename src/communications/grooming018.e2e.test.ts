import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CommunicationPreference, CommunicationRoute } from "./contracts.js";
import { resolveCommunicationRoute } from "./resolver.js";

const migration = readFileSync(new URL("../../supabase/migrations/20260829130000_grooming018_communication_router.sql", import.meta.url), "utf8");
const claimRpc = readFileSync(new URL("../../supabase/migrations/20260828120400_grooming018_master_claim_rpc.sql", import.meta.url), "utf8");
const claimTable = readFileSync(new URL("../../supabase/migrations/20260828120200_grooming018_master_claim_table.sql", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../beauty/BeautyMasterWorkspacePage.tsx", import.meta.url), "utf8");
const claimPage = readFileSync(new URL("../beauty/BeautyMasterClaimPage.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

const route = (id: string, channel: CommunicationRoute["channel"]): CommunicationRoute => ({
  id, channel, userKey: "user:canonical", providerIdentityId: `identity:${id}`,
  destinationRef: `server:${id}`, readiness: "ready",
  capabilities: ["contact", "inbound", "outbound", "notification"],
  consent: "granted", health: "healthy",
});
const preference = (primaryRouteId: string): CommunicationPreference => ({
  userKey: "user:canonical", state: "configured", primaryRouteId,
  fallbackRouteIds: [], updatedAt: "2026-08-29T12:00:00Z",
});

describe("GROOMING018 A-I bounded acceptance", () => {
  it("selects exactly one preferred route for a canonical user with multiple identities", () => {
    const telegram = route("telegram", "telegram");
    const email = route("email", "email");
    expect(resolveCommunicationRoute(preference(telegram.id), [email, telegram], "booking")).toMatchObject({ outcome: "executable", route: { id: telegram.id } });
  });
  it("uses the changed preference for the next eligible message", () => {
    const telegram = route("telegram", "telegram"); const email = route("email", "email");
    expect(resolveCommunicationRoute(preference(email.id), [telegram, email], "review")).toMatchObject({ outcome: "executable", route: { id: email.id } });
  });
  it("returns deterministic attention and never inferred-provider switching", () => {
    const revoked = { ...route("messenger", "messenger"), readiness: "revoked" as const };
    const telegram = route("telegram", "telegram");
    expect(resolveCommunicationRoute(preference(revoked.id), [telegram, revoked], "reminder")).toEqual({ outcome: "needs_attention", reason: "disabled_or_revoked", routeId: revoked.id });
  });
  it("keeps linked identity, readiness and consent as separate persistence state", () => {
    expect(migration).toContain("provider_identity_id uuid");
    expect(migration).toContain("readiness text");
    expect(migration).toContain("consent_state text");
    expect(migration).toContain("preference.state");
  });
  it("preserves one-time hash-only draft claim and explicit publish", () => {
    expect(claimTable).toContain("token_hash text not null unique");
    expect(claimTable).not.toMatch(/raw_token|claim_token text/);
    expect(claimRpc).toContain("if v_claim.claimed_at is not null");
    expect(claimRpc).toContain("'draft'");
    expect(claimRpc).not.toContain("'published'");
    expect(workspace).toContain("togglePublication");
    expect(workspace).toContain("nextPublished = !workspace.published");
  });
  it("places required communication selection after global terms gate and before workspace", () => {
    expect(main).toContain("<FirstOnboardingGate />");
    expect(claimPage).toContain("<CommunicationPreferencePanel language={language} required");
    expect(claimPage.indexOf("CommunicationPreferencePanel")).toBeLessThan(claimPage.indexOf('window.location.replace("/beauty/workspace")'));
  });
  it("does not import Activity lifecycle semantics or client-side destinations/secrets", () => {
    const clientContracts = readFileSync(new URL("./contracts.ts", import.meta.url), "utf8");
    const clientRepository = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
    expect(clientContracts).not.toMatch(/participant|organizer|group|topic/i);
    expect(clientRepository).not.toContain("provider_user_id");
    expect(clientRepository).not.toMatch(/SERVICE_ROLE|BOT_TOKEN|ACCESS_TOKEN/);
  });
});
