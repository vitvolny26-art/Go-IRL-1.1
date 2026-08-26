import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEventNotificationText } from "./message-builder";
import { legacyEventNotificationKindMap } from "./service-contracts";
import type { EventNotificationDelivery } from "./types";

const migration = readFileSync(new URL("../../supabase/migrations/20260826100000_grooming009_visit_closure_review.sql", import.meta.url), "utf8");

describe("GROOMING009 visit confirmation contract", () => {
  it("maps and renders the +24h Beauty visit prompt", () => {
    expect(legacyEventNotificationKindMap["services.booking_visit_confirmation_24h"]).toBe("services.booking_visit_confirmation_24h");
    const delivery: EventNotificationDelivery = {
      id: "n1", userKey: "telegram:client", kind: "services.booking_visit_confirmation_24h",
      payload: { subjectType: "beauty_booking", bookingId: "b1", title: { ru: "Маникюр" }, counterpartName: "Studio Vita" },
      attemptCount: 1, provider: "telegram", recipientId: "123", language: "ru", openUrl: "https://goirl.example/services",
    };
    expect(buildEventNotificationText(delivery)).toContain("Как прошёл ваш визит");
    expect(buildEventNotificationText(delivery)).toContain("оценку 1–5");
  });

  it("keeps existing outbox kinds and enforces trust guards", () => {
    expect(migration).toContain("'social.favorited'");
    expect(migration).toContain("'social.favorite_organizer_event_created'");
    expect(migration).toContain("'services.booking_reminder_24h'");
    expect(migration).toContain("'services.booking_reminder_3h'");
    expect(migration).toContain("booking must already be completed or no_show");
    expect(migration).toContain("rating/review requires happened confirmation");
    expect(migration).toContain("dispute_state");
    expect(migration).toContain("on conflict (delivery_key) do nothing");
  });
});
