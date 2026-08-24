/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260824154500_act080_005b_recurring_activity_series_foundation.sql", import.meta.url),
  "utf8",
);

const verification = readFileSync(
  new URL("../supabase/verify_act080_005b_recurring_activity_series.sql", import.meta.url),
  "utf8",
);

describe("ACT080-005B recurring Activity series migration contract", () => {
  it("stores a finite weekly series and links ordinary Activity occurrences", () => {
    expect(migration).toContain("create table if not exists public.activity_series");
    expect(migration).toContain("occurrence_count between 1 and 104");
    expect(migration).toContain("activity_series_owner_idempotency_idx");
    expect(migration).toContain("add column if not exists series_id uuid references public.activity_series(id) on delete restrict");
    expect(migration).toContain("activities_series_occurrence_number_unique");
    expect(migration).toContain("activities_series_occurrence_date_unique");
  });

  it("materializes each weekly occurrence as a normal Activity with isolated membership", () => {
    expect(migration).toContain("from generate_series(0, v_occurrence_count - 1) as occurrence(step)");
    expect(migration).toContain("p_start_date + (step * 7)");
    expect(migration).toContain("insert into public.activity_members");
    expect(migration).toContain("from unnest(v_activity_ids) as occurrence_activity(activity_id)");
    expect(migration).toContain("'scheduled'");
  });

  it("uses trusted identity/onboarding and prevents direct client series mutation", () => {
    expect(migration).toContain("public.go_irl_auth_user_key()");
    expect(migration).toContain("go_irl_private.has_completed_first_onboarding(v_user_key)");
    expect(migration).toContain("security definer");
    expect(migration).toContain("series_idempotency_key_reused_with_different_parameters");
    expect(migration).toContain("revoke insert, update, delete on table public.activity_series from authenticated");
    expect(migration).toContain("using (organizer_key = public.go_irl_auth_user_key())");
    expect(migration).toContain("go_irl_private.activity_series_link_is_valid(series_id, organizer_key)");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it("keeps verification rollback-only", () => {
    expect(verification.trimEnd()).toMatch(/rollback;$/);
    expect(verification).toContain("weekly series RPC missing");
    expect(verification).toContain("authenticated has direct activity_series mutation privilege");
  });
});
