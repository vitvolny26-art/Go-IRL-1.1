import { describe, expect, it } from "vitest";
import {
  buildAppleCalendarUrl,
  buildCalendarProviderUrl,
  buildOutlookCalendarUrl,
  buildRawGoogleCalendarUrl,
  getCalendarDateRange,
} from "./googleCalendar";
import type { Activity } from "../types";

const activity: Activity = {
  id: "calendar-1",
  type: "sport",
  categoryId: "sport",
  activity: {
    ru: "🏐 Волейбол",
    uk: "🏐 Волейбол",
    cs: "🏐 Volejbal",
    en: "🏐 Volleyball",
    pl: "🏐 Volleyball",
    sk: "🏐 Volejbal",
  },
  title: {
    ru: "Волейбол после работы",
    uk: "Волейбол після роботи",
    cs: "Volejbal po práci",
    en: "Volleyball after work",
    pl: "Volleyball after work",
    sk: "Volejbal po práci",
  },
  description: {
    ru: "Играем спокойно, можно новичкам.",
    uk: "Граємо спокійно, можна новачкам.",
    cs: "Hrajeme v klidu, začátečníci vítáni.",
    en: "Casual game, beginners welcome.",
    pl: "Casual game, beginners welcome.",
    sk: "Hrajeme v klidu, začátečníci vítáni.",
  },
  date: "2026-07-10",
  time: "18:00",
  cityId: "praha",
  address: "парк Летна",
  locationUrl: "https://example.com/place",
  participantNote: "Возьмите воду",
  price: 0,
  capacity: 8,
  participants: 2,
  members: [],
  organizer: "Vit",
  organizerKey: "guest:test",
  visibility: "public",
};

const queryParams = (url: string) => new URL(url).searchParams;

describe("calendar provider helpers", () => {
  it("builds a Google Calendar template URL", () => {
    const url = buildRawGoogleCalendarUrl(activity, {
      language: "ru",
      eventUrl: "https://t.me/GOirl_bot?startapp=calendar-1",
    });
    const params = queryParams(url);

    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(params.get("action")).toBe("TEMPLATE");
    expect(params.get("text")).toBe("Волейбол после работы");
    expect(params.get("dates")).toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
  });

  it("encodes title and location through URLSearchParams", () => {
    const params = queryParams(buildRawGoogleCalendarUrl(activity, { language: "ru" }));
    expect(params.get("text")).toBe("Волейбол после работы");
    expect(params.get("location")).toBe("Прага, парк Летна");
  });

  it("builds an Apple calendar data URL", () => {
    const url = buildAppleCalendarUrl(activity, { language: "en" });
    expect(url.startsWith("data:text/calendar;charset=utf-8,")).toBe(true);
    const decoded = decodeURIComponent(url.split(",", 2)[1]);
    expect(decoded).toContain("BEGIN:VEVENT");
    expect(decoded).toContain("SUMMARY:Volleyball after work");
  });

  it("builds an Outlook compose URL", () => {
    const url = buildOutlookCalendarUrl(activity, { language: "en" });
    const params = queryParams(url);
    expect(url.startsWith("https://outlook.live.com/calendar/0/deeplink/compose?")).toBe(true);
    expect(params.get("subject")).toBe("Volleyball after work");
    expect(params.get("startdt")).toMatch(/Z$/);
  });

  it("routes each provider explicitly", () => {
    expect(buildCalendarProviderUrl(activity, "google")).toContain("calendar.google.com");
    expect(buildCalendarProviderUrl(activity, "apple")).toContain("data:text/calendar");
    expect(buildCalendarProviderUrl(activity, "outlook")).toContain("outlook.live.com");
  });

  it("uses the default 90 minute duration when no vertical duration exists", () => {
    const { start, end } = getCalendarDateRange(activity);
    expect((end.getTime() - start.getTime()) / 60000).toBe(90);
  });

  it("uses sport duration when provided", () => {
    const withDuration: Activity = {
      ...activity,
      metadata: { sport: { durationMinutes: 45 } },
    };
    const { start, end } = getCalendarDateRange(withDuration);
    expect((end.getTime() - start.getTime()) / 60000).toBe(45);
  });

  it("puts the event link into calendar details", () => {
    const params = queryParams(buildRawGoogleCalendarUrl(activity, {
      language: "en",
      eventUrl: "https://t.me/GOirl_bot?startapp=calendar-1",
    }));
    expect(params.get("details")).toContain("https://t.me/GOirl_bot?startapp=calendar-1");
    expect(params.get("details")).toContain("GO IRL");
  });
});
