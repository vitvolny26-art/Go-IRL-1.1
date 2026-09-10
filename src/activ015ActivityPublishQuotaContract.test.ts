/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260910124500_activ015_activity_publish_quota_organizer_gate.sql", import.meta.url),
  "utf8",
);
const verifier = readFileSync(
  new URL("../supabase/verify_activ015_activity_publish_quota_organizer_gate.sql", import.meta.url),
  "utf8",
);
const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
const recurringMigration = readFileSync(
  new URL("../supabase/migrations/20260824154500_act080_005b_recurring_activity_series_foundation.sql", import.meta.url),
  "utf8",
);

describe("Activ015 Activity publication quota and Organizer gate", () => {
  it("enforces the 2/5 daily quota on the shared activities INSERT boundary", () => {
    expect(migration).toContain("before insert on public.activities");
    expect(migration).toContain("v_limit := case when v_role = 'organizer' then 5 else 2 end");
    expect(migration).toContain("activity_daily_publish_limit_reached");
    expect(migration).toContain("Europe/Prague");
    expect(migration).toContain("new.created_at := v_now");
  });

  it("uses an atomic per-user/day usage row so concurrent and multi-row inserts cannot bypass quota", () => {
    expect(migration).toContain("create table if not exists public.activity_daily_publish_usage");
    expect(migration).toContain("primary key (user_key, local_date)");
    expect(migration).toContain("on conflict (user_key, local_date) do update");
    expect(migration).toContain("publish_count = public.activity_daily_publish_usage.publish_count + 1");
    expect(migration).toContain("where public.activity_daily_publish_usage.publish_count < v_limit");
    expect(migration).toContain("revoke all on table public.activity_daily_publish_usage from public, anon, authenticated");
  });

  it("covers both existing single and recurring creation paths and aborts an over-limit series atomically", () => {
    expect(store).toContain('supabase.from("activities").insert(insertRow)');
    expect(store).toContain('"go_irl_create_weekly_activity_series"');
    expect(recurringMigration).toContain("from generate_series(0, v_occurrence_count - 1)");
    expect(migration).toContain("create trigger activ015_activity_daily_publish_limit");
    expect(migration).toContain("rolls back the whole");
  });

  it("requires ten canonically confirmed Activities before organizer role redemption", () => {
    expect(migration).toContain("activ015_organizer_qualifying_activity_count");
    expect(migration).toContain("outcome.organizer_event_claim = 'happened'");
    expect(migration).toContain("outcome.event_resolution = 'confirmed_happened'");
    expect(migration).toContain("feedback.eligibility_state = 'eligible'");
    expect(migration).toContain("feedback.resolution = 'attended'");
    expect(migration).toContain("feedback.participant_user_key <> p_user_key");
    expect(migration).toContain("v_qualifying_count < 10");
  });

  it("keeps manual admin invitation approval and the existing role store", () => {
    expect(migration).toContain("public.role_invitations%rowtype");
    expect(migration).toContain("insert into public.user_roles");
    expect(migration).toContain("'role_invitation.redeemed'");
    expect(migration).not.toContain("create table public.organizer");
  });

  it("ships a structural verifier for the protected migration", () => {
    expect(verifier).toContain("activ015_daily_publish_usage_missing");
    expect(verifier).toContain("activ015_atomic_usage_gate_missing");
    expect(verifier).toContain("activ015_qualifying_activity_contract_missing");
    expect(verifier).toContain("activ015_organizer_redemption_gate_missing");
    expect(verifier).toContain("Activ015 Activity publish quota + organizer gate structural verification: PASS");
  });
});
