/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260904190000_postevent001_d3_telegram_callback_bridge.sql", import.meta.url),
  "utf8",
);
const verifier = readFileSync(
  new URL("../supabase/verify_postevent001_d3_telegram_callback_bridge.sql", import.meta.url),
  "utf8",
);

describe("POSTEVENT001 D3 Telegram callback bridge contract", () => {
  it("uses one actor-explicit mutation state machine for Mini App and Telegram", () => {
    expect(migration).toContain("postevent_record_outcome_for_actor");
    expect(migration).toContain("postevent_submit_confirmation_for_actor");
    expect(migration).toContain("return go_irl_private.postevent_record_outcome_for_actor");
    expect(migration).toContain("return go_irl_private.postevent_submit_confirmation_for_actor");
    expect(migration).toContain("go_irl_post_event_telegram_action");
  });

  it("derives canonical actor only from active consented Telegram identity", () => {
    expect(migration).toContain("public.user_provider_identities");
    expect(migration).toContain("identity.provider = 'telegram'");
    expect(migration).toContain("identity.provider_user_id = v_telegram_user_id");
    expect(migration).toContain("identity.status = 'active'");
    expect(migration).toContain("identity.consented_at is not null");
    expect(migration).not.toContain("p_user_key");
    expect(migration).not.toContain("p_role");
    expect(migration).not.toContain("request.jwt.claims");
  });

  it("keeps the callback bridge service-role only", () => {
    expect(migration).toContain(
      "revoke all on function public.go_irl_post_event_telegram_action(text,text,uuid,text)\nfrom public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.go_irl_post_event_telegram_action(text,text,uuid,text)\nto service_role",
    );
    expect(verifier).toContain("postevent001_d3_bridge_exposed_to_authenticated");
  });

  it("preserves current organizer-first participant gate", () => {
    expect(migration).toContain("participant confirmation not open yet");
    expect(migration).toContain("v_outcome.organizer_event_claim is null");
    expect(migration).toContain("v_outcome.organizer_roster_finalized_at is null");
  });

  it("limits Telegram mutations to the two current prompt actions", () => {
    expect(migration).toContain("p_action = 'organizer_outcome'");
    expect(migration).toContain("p_action = 'participant_confirmation'");
    expect(migration).toContain("invalid post-event Telegram action");
    expect(migration).not.toContain("create table");
    expect(migration).not.toContain("create trigger");
    expect(migration).not.toContain("alter table");
  });
});
