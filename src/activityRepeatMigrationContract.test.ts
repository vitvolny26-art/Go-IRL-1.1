/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260825162000_act080_005c_telegram_confirmed_repeat.sql", import.meta.url),
  "utf8",
);

describe("ACT080-005C Telegram-confirmed repeat migration contract", () => {
  it("changes weekly create into one Activity plus durable repeat opt-in", () => {
    expect(migration).toContain("create table if not exists public.activity_repeat_chains");
    expect(migration).toContain("return query select v_chain_id, array[v_activity_id]");
    expect(migration).not.toContain("generate_series(0, v_occurrence_count - 1)");
    expect(migration).toContain("repeat_enabled boolean not null default true");
  });

  it("schedules the organizer prompt 24 hours after the Activity end", () => {
    expect(migration).toContain("make_interval(mins => v_duration_minutes)");
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toContain("go_irl_claim_due_repeat_prompts");
    expect(migration).toContain("for update of chain skip locked");
  });

  it("publishes exactly one +7 day Activity and keeps participants occurrence-scoped", () => {
    expect(migration).toContain("v_source.event_date + 7");
    expect(migration).toContain("insert into public.activity_members(activity_id, user_key, display_name, status)");
    expect(migration).toContain("values (v_created, v_source.organizer_key, v_source.organizer, 'joined')");
    expect(migration).toContain("series_id, series_occurrence_no, series_occurrence_status");
    expect(migration).toContain("false, false, null, null, null");
  });

  it("makes duplicate decisions idempotent and No terminate the chain", () => {
    expect(migration).toContain("if v_chain.decision is not null then");
    expect(migration).toContain("return query select v_chain.next_activity_id, v_chain.repeat_enabled");
    expect(migration).toContain("set decision = 'no', decided_at = now(), repeat_enabled = false");
    expect(migration).toContain("repeat_organizer_mismatch");
  });
});
