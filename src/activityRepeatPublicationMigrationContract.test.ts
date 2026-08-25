/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260825162000_act080_005c_repeat_publication_prompts.sql", import.meta.url),
  "utf8",
);

describe("ACT080-005C Telegram-confirmed repeat publication contract", () => {
  it("uses Activity metadata as create-time Repeat opt-in and creates one Activity", () => {
    expect(migration).toContain("{repeatPublication,enabled}");
    expect(migration).toContain("repeat_publication_must_be_enabled_at_create");
    expect(migration).toContain("return query select v_prompt_id, array[v_activity_id]");
    expect(migration).not.toContain("generate_series(0, v_occurrence_count - 1)");
  });

  it("schedules a durable prompt at lifecycle end plus 24 hours", () => {
    expect(migration).toContain("activity_repeat_publication_prompts");
    expect(migration).toContain("activity_type = 'sport'");
    expect(migration).toContain("else 120");
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toContain("v_expires_at := v_event_starts_at + interval '7 days'");
  });

  it("routes only to an active consented Telegram identity", () => {
    expect(migration).toContain("identity.provider = 'telegram'");
    expect(migration).toContain("identity.status = 'active'");
    expect(migration).toContain("identity.consented_at is not null");
    expect(migration).toContain("repeat_organizer_mismatch");
  });

  it("creates exactly one isolated +7 day Activity on Yes and keeps Repeat enabled", () => {
    expect(migration).toContain("v_source.event_date + 7");
    expect(migration).toContain("values (v_created, v_source.organizer_key, v_source.organizer, 'joined')");
    expect(migration).toContain("false,\n    false,\n    null,\n    null,\n    null");
    expect(migration).toContain("'{repeatPublication,enabled}', 'true'::jsonb");
  });

  it("makes duplicate callbacks idempotent and rejects expired/deactivated sources", () => {
    expect(migration).toContain("if v_prompt.status in ('yes', 'no') then");
    expect(migration).toContain("v_prompt.expires_at <= now()");
    expect(migration).toContain("repeat_source_not_publishable");
    expect(migration).toContain("repeat_source_cancelled");
    expect(migration).toContain("repeat_source_opt_out");
  });
});
