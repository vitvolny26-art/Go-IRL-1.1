import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260809220454_onb200_first_onboarding_activation_contract.sql", import.meta.url),
  "utf8",
);

const verification = readFileSync(
  new URL("../../supabase/verify_onb200_first_onboarding.sql", import.meta.url),
  "utf8",
);

describe("ONB200-A migration contract", () => {
  it("stores handles and activation evidence behind RLS without direct client table grants", () => {
    expect(migration).toContain("create table if not exists public.user_handles");
    expect(migration).toContain("create table if not exists public.user_onboarding_activations");
    expect(migration).toContain("alter table public.user_handles enable row level security");
    expect(migration).toContain("alter table public.user_onboarding_activations enable row level security");
    expect(migration).toContain("revoke all on table public.user_handles from authenticated");
    expect(migration).toContain("revoke all on table public.user_onboarding_activations from authenticated");
    expect(migration).toContain("using (user_key = public.go_irl_auth_user_key())");
  });

  it("uses trusted JWT identity, active-user serialization, server timestamps, and current legal versions", () => {
    expect(migration).toContain("public.go_irl_auth_user_key()");
    expect(migration).toContain("app_user.status = 'active'");
    expect(migration).toContain("for update;");
    expect(migration).toContain("c_terms_version constant text := '2026-07-29'");
    expect(migration).toContain("c_privacy_version constant text := '2026-07-14'");
    expect(migration).toContain("v_now := statement_timestamp()");
  });

  it("enforces normalized unique nicknames, reserved namespaces, immutability, and idempotent replay", () => {
    expect(migration).toContain("unique (normalized_nickname)");
    expect(migration).toContain("^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$");
    expect(migration).toContain("^(goirl|admin|support|moderator|official)(_|$)");
    expect(migration).toContain("first onboarding evidence is immutable");
    expect(migration).toContain("return v_existing;");
  });

  it("keeps privileged implementation outside the exposed schema and verifies with rollback-only SQL", () => {
    expect(migration).toContain("create schema if not exists go_irl_private");
    expect(migration).toContain("security definer");
    expect(migration).toContain("create or replace function public.get_my_first_onboarding()");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("create or replace function public.complete_my_first_onboarding(");
    expect(verification.trimEnd()).toMatch(/rollback;$/);
    expect(verification).toContain("direct handle read allowed");
    expect(verification).toContain("blocked user activation allowed");
    expect(verification).toContain("idempotent replay changed completion evidence");
  });
});
