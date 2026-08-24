/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260824175500_act080_005b_s2_favorite_organizer_notification_guard.sql", import.meta.url),
  "utf8",
);

const verification = readFileSync(
  new URL("../supabase/verify_act080_005b_s2_favorite_organizer_notification_guard.sql", import.meta.url),
  "utf8",
);

describe("ACT080-005B-S2 favorite-organizer series notification guard", () => {
  it("suppresses duplicate follower notifications for later series occurrences", () => {
    expect(migration).toContain("new.series_id is not null and new.series_occurrence_no is distinct from 1");
    expect(migration).toContain("return new;");
  });

  it("preserves the existing notification contract for ordinary Activities and the first occurrence", () => {
    expect(migration).toContain("new.visibility = 'private'");
    expect(migration).toContain("favorite.subject_type = 'organizer'");
    expect(migration).toContain("favorite.status = 'active'");
    expect(migration).toContain("'social.favorite_organizer_event_created'");
    expect(migration).toContain("'favorite-organizer:' || v_favorite.user_key || ':' || new.organizer_key || ':' || new.id::text");
  });

  it("keeps verification rollback-only and checks the existing Activity insert trigger", () => {
    expect(verification.trimEnd()).toMatch(/rollback;$/);
    expect(verification).toContain("activities_queue_favorite_organizer_notification");
    expect(verification).toContain("AFTER INSERT");
    expect(verification).toContain("FOR EACH ROW");
  });
});
