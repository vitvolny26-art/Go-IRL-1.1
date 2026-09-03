/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260903123000_postevent001_organizer_first_gate.sql", import.meta.url), "utf8");
const verifier = readFileSync(new URL("../supabase/verify_postevent001_organizer_first_gate.sql", import.meta.url), "utf8");

describe("POSTEVENT001 organizer-first gate", () => {
  it("removes the participant fallback release path", () => {
    expect(migration).not.toContain("participant_fallback_at");
    expect(migration).not.toContain("now() < v_outcome.participant_fallback_at");
    expect(migration).toContain("postevent_waiting_for_organizer");
  });

  it("requires organizer decision and roster finalization before participant attendance", () => {
    expect(migration).toContain("v_outcome.organizer_event_claim is null");
    expect(migration).toContain("v_outcome.organizer_event_claim = 'happened' and v_outcome.organizer_roster_finalized_at is null");
    expect(migration).toContain("raise exception 'participant confirmation not open yet'");
  });

  it("only cancels unsent participant notifications during migration cleanup", () => {
    expect(migration).toContain("n.status in ('scheduled','failed')");
    expect(migration).not.toMatch(/n\.status\s+in\s+\([^)]*sent[^)]*\)/);
  });

  it("ships a production verifier for the same invariants", () => {
    expect(verifier).toContain("participant fallback scheduling bypass still present");
    expect(verifier).toContain("time-based participant RPC bypass still present");
    expect(verifier).toContain("organizer decision RPC gate missing");
    expect(verifier).toContain("organizer roster RPC gate missing");
  });
});
