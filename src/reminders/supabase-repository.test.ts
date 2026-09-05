import { describe, expect, it } from "vitest";
import { hydrateReminderDelivery } from "./supabase-repository.js";

const reminder = { id: "reminder-1", delivery_key: "delivery-1", user_key: "telegram:123", activity_id: "11111111-1111-4111-8111-111111111111", provider: "telegram" as const, lead_minutes: 60 as const, attempt_count: 1 };
const event = { id: reminder.activity_id, title_ru: "Волейбол", title_cs: "Volejbal", event_date: "2026-07-30", event_time: "18:00:00", address: "ZŠ Demlova, Olomouc", location_url: null };

describe("hydrateReminderDelivery", () => {
  it("builds trusted event, calendar, and map links for an active opted-in identity", () => {
    const result = hydrateReminderDelivery({ reminder, identity: { provider_user_id: "123", status: "active", consented_at: "2026-07-23T09:00:00Z", last_inbound_at: "2026-07-23T08:00:00Z" }, event, publicOrigin: "https://go-irl.example/", language: "ru" });
    expect(result.recipientId).toBe("123"); expect(result.cancelReason).toBeUndefined(); expect(result.event.openUrl).toContain(`/api/meta/event-preview?event=${reminder.activity_id}`); expect(result.event.calendarUrl).toContain("calendar.google.com/calendar/render"); expect(result.event.mapUrl).toContain("google.com/maps/search"); expect(result.event.dateTime).toContain("18:00");
  });

  it("keeps the canonical six-language reminder locale while mapping four-language content boundaries", () => {
    const result = hydrateReminderDelivery({ reminder, identity: { provider_user_id: "123", status: "active", consented_at: "2026-07-23T09:00:00Z", last_inbound_at: null }, event, publicOrigin: "https://go-irl.example", language: "pl" });
    expect(result.language).toBe("pl");
    expect(result.event.openUrl).toContain("language=en");
    expect(result.event.dateTime).toContain("2026");
  });

  it.each([
    { name: "missing identity", identity: null, event, reason: "provider_identity_missing" },
    { name: "revoked identity", identity: { provider_user_id: "123", status: "revoked" as const, consented_at: "2026-07-23T09:00:00Z", last_inbound_at: null }, event, reason: "provider_identity_revoked" },
    { name: "missing consent", identity: { provider_user_id: "123", status: "active" as const, consented_at: null, last_inbound_at: null }, event, reason: "provider_consent_missing" },
    { name: "deleted event", identity: { provider_user_id: "123", status: "active" as const, consented_at: "2026-07-23T09:00:00Z", last_inbound_at: null }, event: null, reason: "event_missing" },
  ])("cancels $name before network delivery", ({ identity, event: selectedEvent, reason }) => {
    const result = hydrateReminderDelivery({ reminder, identity, event: selectedEvent, publicOrigin: "https://go-irl.example", language: "ru" });
    expect(result.cancelReason).toBe(reason);
  });
});
