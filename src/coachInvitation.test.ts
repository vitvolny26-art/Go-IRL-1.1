import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCoachInvitationUrl,
  coachInvitationStorageKey,
  normalizeCoachInvitationCode,
  readRememberedCoachInvitationCode,
  rememberCoachInvitationCode,
} from "./coachInvitation";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119170000_sport_coach_private_invitations.sql", import.meta.url),
  "utf8",
);
const valid = "abc123ef".repeat(8);

describe("Sport Coach private invitation", () => {
  it("sends the secret only in the fragment, not in URL path or query", () => {
    const value = buildCoachInvitationUrl(valid, "https://go-irl.fun");
    const url = new URL(value);
    expect(url.pathname).toBe("/coach-invite");
    expect(url.search).toBe("");
    expect(url.hash).toBe("#" + valid);
    expect(normalizeCoachInvitationCode(url.hash)).toBe(valid);
  });

  it("rejects malformed codes", () => {
    expect(normalizeCoachInvitationCode("test")).toBeNull();
    expect(normalizeCoachInvitationCode(valid.slice(0, 63))).toBeNull();
    expect(() => buildCoachInvitationUrl("invalid", "https://go-irl.fun")).toThrow();
  });

  it("restores a code across browser OAuth redirect without permanent storage", () => {
    const values = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => { values.set(key, value); },
      getItem: (key: string) => values.get(key) || null,
    } as Storage;
    const before = Date.now();
    rememberCoachInvitationCode(valid, storage);
    expect(values.has(coachInvitationStorageKey)).toBe(true);
    expect(readRememberedCoachInvitationCode(storage, before + 2000)).toBe(valid);
    expect(readRememberedCoachInvitationCode(storage, before + 49 * 3600000)).toBeNull();
  });

  it("does not create a participant when the candidate offers to coach", () => {
    expect(migration).toContain("create table public.coach_event_invitations");
    expect(migration).toContain("alter table public.coach_event_invitations enable row level security");
    expect(migration).toContain("token_hash bytea not null unique");
    expect(migration).toContain("sha256(convert_to(p_token,'UTF8'))");
    expect(migration).not.toContain("insert into public.activity_members");
    expect(migration).not.toContain("grant select on public.activities");
  });

  it("requires a saved eligible coach role and another account", () => {
    expect(migration).toContain("ri.role_id='coach'");
    expect(migration).toContain("'can_help'");
    expect(migration).toContain("'professional'");
    expect(migration).toContain("v_event.organizer_key=v_actor");
    expect(migration).toContain("on conflict(user_key) do nothing");
  });

  it("supports atomic one-coach selection and bounded invitation access", () => {
    expect(migration).toContain("coach_event_offers_one_per_candidate");
    expect(migration).toContain("for share;");
    expect(migration).toContain("for update;");
    expect(migration).toContain("i.claimed_by_user_key");
    expect(migration).toContain("rate limit exceeded");
    expect(migration).toContain("revoked_at is null");
    expect(migration).toContain("least(now()+interval '48 hours'");
    for (const name of [
      "go_irl_create_coach_invitation",
      "go_irl_preview_coach_invitation",
      "go_irl_submit_invited_coach_offer",
      "go_irl_revoke_coach_invitation",
    ]) {
      expect(migration).toContain("create function public." + name + "(");
      expect(migration).toContain("revoke all on function public." + name + "(");
      expect(migration).toContain("grant execute on function public." + name + "(");
    }
  });
});
