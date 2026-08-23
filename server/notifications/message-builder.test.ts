import { describe, expect, it } from "vitest";
import { buildEventNotificationText } from "./message-builder";
import type { EventNotificationDelivery } from "./types";

const delivery = (kind: EventNotificationDelivery["kind"]): EventNotificationDelivery => ({ id: "notification-1", userKey: "user:1", activityId: "event-1", kind, payload: { eventId: "event-1", title: { ru: "Волейбол" }, date: "2026-07-24", time: "18:30:00", address: "ZŠ Demlova", changedFields: ["time", "location"] }, attemptCount: 1, provider: "telegram", recipientId: "123", language: "ru", openUrl: "https://go-irl-1-0.vercel.app/join/event-1" });
const beautyDelivery: EventNotificationDelivery = { id: "notification-beauty", userKey: "telegram:client", kind: "services.booking_confirmed", payload: { subjectType: "beauty_booking", bookingId: "booking-1", title: { cs: "Gelová manikúra", en: "Gel manicure" }, date: "2026-08-08", time: "10:30:00", address: "Olomouc centrum", counterpartName: "Studio Vita", openPath: "/services" }, attemptCount: 1, provider: "telegram", recipientId: "123", language: "cs", openUrl: "https://goirl.example/services" };

describe("event notification messages", () => {
  it("renders a join confirmation with event details", () => { expect(buildEventNotificationText(delivery("join_confirmed"))).toContain("Вы участвуете"); expect(buildEventNotificationText(delivery("join_confirmed"))).toContain("Волейбол") });
  it("lists changed event fields", () => { expect(buildEventNotificationText(delivery("event_changed"))).toContain("time, location") });
  it("renders a Beauty booking reschedule notification", () => { const text = buildEventNotificationText({ ...beautyDelivery, kind: "services.booking_rescheduled" }); expect(text).toContain("Запись перенесена"); expect(text).toContain("Gelová manikúra"); expect(text).toContain("2026-08-08 · 10:30") });
  it("renders Beauty 24h reminder", () => { const text = buildEventNotificationText({ ...beautyDelivery, kind: "services.booking_reminder_24h" }); expect(text).toContain("завтра"); expect(text).toContain("Gelová manikúra") });
  it("renders Beauty 3h reminder", () => { const text = buildEventNotificationText({ ...beautyDelivery, kind: "services.booking_reminder_3h" }); expect(text).toContain("через 3 часа"); expect(text).toContain("10:30") });
  it("renders exact-slot waitlist availability without promising a reservation", () => { const text = buildEventNotificationText({ ...beautyDelivery, kind: "services.waitlist_slot_available", payload: { ...beautyDelivery.payload, bookingId: undefined, waitlistId: "waitlist-1", reservationGuaranteed: false } }); expect(text).toContain("Слот освободился"); expect(text).toContain("Место не зарезервировано") });
  it("renders canonical Beauty booking details without exact address", () => { const text = buildEventNotificationText(beautyDelivery); expect(text).toContain("Запись подтверждена"); expect(text).toContain("Gelová manikúra"); expect(text).toContain("Olomouc centrum"); expect(text).toContain("Studio Vita"); expect(text).not.toContain("Horní náměstí") });
});
