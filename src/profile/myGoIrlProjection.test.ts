import { describe, expect, it } from "vitest";
import type { Activity } from "../types";
import { buildMyGoIrlProjection, buildOrganizerEventHistory } from "./myGoIrlProjection";

const activity = (id: string, organizerKey: string, date: string, time = "18:00"): Activity => ({
  id,
  type: "custom",
  categoryId: "social",
  activity: { ru: "Прогулка", uk: "Прогулянка", cs: "Procházka", en: "Walk" , pl: "Walk", sk: "Procházka"},
  title: { ru: id, uk: id, cs: id, en: id , pl: id, sk: id},
  description: { ru: "", uk: "", cs: "", en: "" , pl: "", sk: ""},
  date,
  time,
  cityId: "olomouc",
  address: "Olomouc",
  locationUrl: "",
  participantNote: "",
  price: 0,
  capacity: 6,
  participants: 1,
  members: [],
  organizer: "User",
  organizerKey,
  visibility: "public",
  popular: false,
});

describe("My GO IRL projection", () => {
  it("returns only completed owned events, sorted newest first, without cancelled events or duplicates", () => {
    const old = activity("old", "me", "2026-07-01");
    const recent = activity("recent", "me", "2026-07-02");
    const cancelled = { ...activity("cancelled", "me", "2026-07-03"), seriesOccurrenceStatus: "cancelled" as const };
    const other = activity("other", "other", "2026-07-03");
    const upcoming = activity("upcoming", "me", "2026-08-10");
    const now = new Date("2026-07-29T12:00:00.000Z");
    expect(buildOrganizerEventHistory([old, recent, cancelled, other, upcoming, recent], "me", now).map((item) => item.id)).toEqual(["recent", "old"]);
    expect(buildOrganizerEventHistory([old], "", now)).toEqual([]);
    expect(buildMyGoIrlProjection([old, other, upcoming], "me", ["other"], [], now).past.map((item) => item.id)).toEqual(["old"]);
  });
  it("separates created, joined, pending and past events using lifecycle time", () => {
    const activities = [
      activity("created", "me", "2026-08-10"),
      activity("joined", "other", "2026-08-11"),
      activity("pending", "other", "2026-08-12"),
      activity("past", "me", "2026-07-01"),
    ];
    const projection = buildMyGoIrlProjection(
      activities,
      "me",
      ["joined"],
      ["pending"],
      new Date("2026-07-29T12:00:00.000Z"),
    );

    expect(projection.upcomingCreated.map((item) => item.id)).toEqual(["created"]);
    expect(projection.upcomingJoined.map((item) => item.id)).toEqual(["joined"]);
    expect(projection.pendingRequests.map((item) => item.id)).toEqual(["pending"]);
    expect(projection.past.map((item) => item.id)).toEqual(["past"]);
  });
});
