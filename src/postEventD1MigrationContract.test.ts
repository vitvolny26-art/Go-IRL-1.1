/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cities } from "./config/cities";

const migration = readFileSync(
  new URL("../supabase/migrations/20260901194500_postevent001_d1_trust_foundation.sql", import.meta.url),
  "utf8",
);
const verifier = readFileSync(
  new URL("../supabase/verify_postevent001_d1_trust_foundation.sql", import.meta.url),
  "utf8",
);

describe("POSTEVENT001 D1 migration contract", () => {
  it("keeps Activity trust history separate from mutable participation", () => {
    expect(migration).toContain("create table if not exists public.activity_post_event_outcomes");
    expect(migration).toContain("create table if not exists public.activity_attendance_feedback");
    expect(migration).not.toContain("alter table public.activity_members\nadd column");
    expect(migration).toContain("activity_id uuid primary key,");
    expect(migration).not.toContain("activity_id uuid primary key references public.activities");
  });

  it("keeps authenticated writes RPC-only and organizer feedback reads sanitized", () => {
    expect(migration).toContain("revoke insert, update, delete on table public.activity_attendance_feedback from authenticated");
    expect(migration).toContain("using (participant_user_key = public.go_irl_auth_user_key())");
    const organizerRead = migration.slice(
      migration.indexOf("create or replace function public.go_irl_get_activity_post_event_organizer_state"),
      migration.indexOf("create or replace function public.go_irl_get_activity_post_event_participant_state"),
    );
    expect(organizerRead).not.toContain("organizer_rating");
    expect(organizerRead).not.toContain("rating_tags");
  });

  it("maps every configured city to the same database timezone", () => {
    for (const city of cities) {
      expect(migration).toContain(`when '${city.id}' then '${city.timezone}'`);
      expect(verifier).toContain(`postevent_activity_timezone('${city.id}') <> '${city.timezone}'`);
    }
  });

  it("keeps organizer silence non-punitive and does not auto-confirm non-occurrence", () => {
    expect(migration).toContain("participant confirmation not open yet");
    expect(migration).toContain("confirmed_not_happened");
    expect(migration).not.toContain("v_resolution := 'confirmed_not_happened'");
    expect(migration).not.toContain("no_show");
  });

  it("preserves the seven-day rating edit window and private structured tags", () => {
    expect(migration).toContain("organizer rating edit window closed");
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain("array['organization','communication','punctuality','safety','other']::text[]");
    expect(migration).not.toContain("review_text");
  });

  it("protects trust state from ordinary identity deletion but permits governed self-delete", () => {
    expect(migration).toContain("current_setting('go_irl.self_delete_user_key', true) = old.user_key");
    expect(migration).toContain("post_event_trust_state_requires_governed_identity_cleanup");
    expect(migration).toContain("before delete on public.app_users");
  });
});
