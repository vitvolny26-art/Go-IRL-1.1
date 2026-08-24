/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260824202500_act080_005b_s3_series_mutations.sql", import.meta.url),
  "utf8",
);

const verification = readFileSync(
  new URL("../supabase/verify_act080_005b_s3_series_mutations.sql", import.meta.url),
  "utf8",
);

describe("ACT080-005B recurring Activity series mutation migration contract", () => {
  it("supports single-occurrence detach and following-occurrence edit without replacing Activity ids", () => {
    expect(migration).toContain("create or replace function public.go_irl_update_activity_series_occurrences");
    expect(migration).toContain("series_id = null");
    expect(migration).toContain("series_occurrence_no = null");
    expect(migration).toContain("activity.series_occurrence_no >= v_target.series_occurrence_no");
    expect(migration).toContain("event_date = activity.event_date + v_date_delta");
    expect(migration).toContain("series_new_start_already_started");
    expect(migration).toContain("where activity.id = any(v_affected_ids)");
  });

  it("keeps reminder and chat lifecycle aligned when following occurrences move", () => {
    expect(migration).toContain("public.go_irl_activity_chat_expires_at(chat.activity_id)");
    expect(migration).toContain("topic_delete_after");
    expect(migration).toContain("activities_reschedule_event_reminders");
  });

  it("cancels occurrences non-destructively and closes dependent delivery paths", () => {
    expect(migration).toContain("create or replace function public.go_irl_cancel_activity_series_occurrences");
    expect(migration).toContain("'event_cancelled'");
    expect(migration).toContain("status = 'cancelled'");
    expect(migration).toContain("status = 'archived'");
    expect(migration).toContain("series_occurrence_status = 'cancelled'");
    expect(migration).toContain("visibility = 'private'");
    expect(migration).toContain("'Europe/Prague'");
    expect(migration).not.toContain("delete from public.activities");
  });

  it("keeps the verifier rollback-only and checks RPC privileges", () => {
    expect(verification.trimEnd()).toMatch(/rollback;$/);
    expect(verification).toContain("anon must not execute series mutation RPCs");
    expect(verification).toContain("authenticated must execute series mutation RPCs");
  });
});
