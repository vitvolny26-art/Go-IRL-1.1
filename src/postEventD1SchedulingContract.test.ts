/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260902050500_postevent001_d1_notification_scheduling.sql", import.meta.url),
  "utf8",
);
const verifier = readFileSync(
  new URL("../supabase/verify_postevent001_d1_notification_scheduling.sql", import.meta.url),
  "utf8",
);

describe("POSTEVENT001 D1 notification scheduling contract", () => {
  it("reuses the canonical outbox and only adds the two POSTEVENT kinds", () => {
    expect(migration).toContain("public.event_notifications");
    expect(migration).toContain("post_event.organizer_confirmation");
    expect(migration).toContain("post_event.participant_confirmation");
    expect(migration).not.toContain("create table public.postevent");
    expect(migration).not.toContain("create table if not exists public.postevent");
  });

  it("uses deterministic organizer and participant delivery keys", () => {
    expect(migration).toContain(":organizer:initial");
    expect(migration).toContain(":organizer:reminder1");
    expect(migration).toContain(":participant:");
    expect(migration).toContain(":confirm");
  });

  it("schedules 10/12/14 through persisted outcome timestamps", () => {
    expect(migration).toContain("organizer_prompt_at");
    expect(migration).toContain("organizer_reminder_at");
    expect(migration).toContain("participant_fallback_at");
    expect(migration).toContain("when v_participant_open then now()");
  });

  it("does not race active sending leases when cancelling", () => {
    expect(migration).toContain("status in ('scheduled','failed')");
    expect(migration).not.toContain("status in ('scheduled','failed','sending')");
  });

  it("keeps provider selection route-neutral and records the D2 apply gate", () => {
    expect(migration).toContain("provider, delivery_key");
    expect(migration).toContain("null,\n      v_initial_key");
    expect(migration).toContain("deploy and verify D2 notification-contract support before applying this SQL");
    expect(verifier).toContain("must not hardcode Telegram provider");
  });
});
