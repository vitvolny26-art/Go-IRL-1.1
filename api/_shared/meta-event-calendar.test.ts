import { describe, expect, it } from "vitest";
import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { buildMetaEventCalendar, buildMetaEventGoogleCalendarUrl } from "./meta-event-calendar.js";

const card: TelegramEventCardInput = {
  eventId: "123e4567-e89b-42d3-a456-426614174000",
  title: "Волейбол, финал",
  activity: "Волейбол",
  date: "21 июл",
  eventDate: "2026-07-21",
  time: "23:30",
  address: "ZŠ Demlova; Olomouc",
  participants: 2,
  capacity: 12,
  icon: "🏐",
  inviteUrl: "https://t.me/GOirl_bot",
  city: "Оломоуц",
  durationMinutes: 120,
  price: 0,
  level: "Любитель",
  format: "Любительский",
  environment: "В помещении",
  language: "ru",
};

describe("Meta event calendar", () => {
  it("builds a portable event from the trusted card facts", () => {
    const result = buildMetaEventCalendar(
      card,
      "https://go-irl.fun/e/123e4567-e89b-42d3-a456-426614174000",
      new Date("2026-07-20T10:11:12Z"),
    );

    expect(result).toContain("DTSTAMP:20260720T101112Z");
    expect(result).toContain("DTSTART;TZID=Europe/Prague:20260721T233000");
    expect(result).toContain("DTEND;TZID=Europe/Prague:20260722T013000");
    expect(result).toContain("SUMMARY:Волейбол\\, финал");
    expect(result).toContain("LOCATION:ZŠ Demlova\\; Olomouc");
    expect(result).toContain("UID:123e4567-e89b-42d3-a456-426614174000@go-irl.fun");
    expect(result).toContain("URL:https://go-irl.fun/e/123e4567-e89b-42d3-a456-426614174000");
    expect(result).not.toContain("go-irl-1-0.vercel.app");
    expect(result.endsWith("\r\n")).toBe(true);
  });

  it("clamps unsafe durations", () => {
    const result = buildMetaEventCalendar({ ...card, durationMinutes: 9999 }, "https://go-irl.fun/e/123e4567-e89b-42d3-a456-426614174000");
    expect(result).toContain("DTEND;TZID=Europe/Prague:20260722T073000");
  });

  it("opens a prefilled Google Calendar event instead of downloading a file", () => {
    const result = buildMetaEventGoogleCalendarUrl(card, "https://go-irl.fun/e/123e4567-e89b-42d3-a456-426614174000");
    const url = new URL(result!);

    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("text")).toBe("Волейбол, финал");
    expect(url.searchParams.get("dates")).toBe("20260721T233000/20260722T013000");
    expect(url.searchParams.get("ctz")).toBe("Europe/Prague");
    expect(url.searchParams.get("details")).toContain("https://go-irl.fun/e/123e4567-e89b-42d3-a456-426614174000");
  });
});
