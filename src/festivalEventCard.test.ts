import { describe, expect, it } from "vitest";
import { festivalCardPresentation, formatFestivalDateRange } from "./festivalEventCard";
import type { Activity, FestivalMetadata } from "./types";

const festival: FestivalMetadata = { schema: "festival.v1", date_from: "2026-09-16", date_to: "2026-09-20", schedule: [{ date: "2026-09-16", start: "16:00", end: "23:00" }], venue: { ru: "náměstí Svobody" }, source: { url: "https://example.test/event" }, hero: { image_url: "/event-backgrounds/imported/brno.jpg", original_image_url: "https://example.test/hero.jpg", source_url: "https://example.test/event" } };
const activity = { id: "x", metadata: { festival }, address: "Brno" } as Activity;

describe("festival event card", () => {
  it("formats a date range instead of a single mandatory time", () => { expect(formatFestivalDateRange(festival, "ru")).toContain("16"); expect(formatFestivalDateRange(festival, "ru")).toContain("20"); });
  it("exposes schedule, venue and owned hero URL", () => { const view = festivalCardPresentation(activity, "ru"); expect(view?.scheduleLines[0]).toContain("16:00–23:00"); expect(view?.venueLabel).toBe("náměstí Svobody"); expect(view?.heroUrl).toBe("/event-backgrounds/imported/brno.jpg"); });
});
