import { describe, expect, it } from "vitest";
import { buildActivityCopySeed } from "./activityCopySeed";
import type { Activity } from "./types";

const source = {
  id: "source-1", type: "sport", categoryId: "sport",
  activity: { ru: "Волейбол", uk: "Волейбол", cs: "Volejbal", en: "Volleyball" },
  title: { ru: "Игра", uk: "Гра", cs: "Hra", en: "Game" },
  description: { ru: "Описание", uk: "Опис", cs: "Popis", en: "Description" },
  date: "2026-09-01", time: "18:00", cityId: "prague", address: "Park",
  locationUrl: "https://maps.example.test/park", participantNote: "Bring water", price: 100, capacity: 8, visibility: "invite",
  organizerKey: "telegram:owner", organizer: "Owner", participants: 3,
  members: [{ userKey: "telegram:member", name: "Member", status: "joined" }],
  metadata: { sport: { sportType: "volleyball", level: "intermediate", format: "casual", environment: "outdoor", equipmentNeeded: true, equipment: "ball", bring: "water", requirements: "", organizerTips: "", durationMinutes: 90 } },
} as Activity;

describe("buildActivityCopySeed", () => {
  it("copies reusable fields without lifecycle identity or schedule", () => {
    const seed = buildActivityCopySeed(source);
    expect(seed).toMatchObject({ categoryId: "sport", cityId: "prague", address: "Park", price: 100, capacity: 8, visibility: "invite" });
    for (const excluded of ["id", "date", "time", "organizerKey", "organizer", "participants", "members"]) expect(seed).not.toHaveProperty(excluded);
    expect(seed.metadata?.sport).toEqual(source.metadata?.sport);
    expect(seed.metadata?.sport).not.toBe(source.metadata?.sport);
  });
});
