import { describe, expect, it } from "vitest";
import { buildActivityCopySeed } from "./activityCopySeed";
import type { Activity } from "./types";

const source = {
  id: "source-1", type: "sport", categoryId: "sport",
  activity: { ru: "Волейбол", uk: "Волейбол", cs: "Volejbal", en: "Volleyball" , pl: "Volleyball", sk: "Volejbal"},
  title: { ru: "Игра", uk: "Гра", cs: "Hra", en: "Game" , pl: "Game", sk: "Hra"},
  description: { ru: "Описание", uk: "Опис", cs: "Popis", en: "Description" , pl: "Description", sk: "Popis"},
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

  it("copies Mushroom picking metadata without sharing its equipment array", () => {
    const mushroomSource = {
      ...source,
      id: "mushroom-source",
      type: "custom",
      categoryId: "nature",
      activity: { ru: "Идём за грибами", uk: "Йдемо по гриби", cs: "Jdeme na houby", en: "Mushroom picking", pl: "Idziemy na grzyby", sk: "Ideme na huby" },
      metadata: {
        mushroomPicking: {
          expertMode: "recommended",
          transportMode: "carpool",
          verificationMode: "planned",
          difficulty: "moderate",
          durationMinutes: 180,
          equipment: ["basket", "boots"],
          childrenPolicy: "welcome",
          petsPolicy: "not_specified",
        },
      },
    } as Activity;

    const seed = buildActivityCopySeed(mushroomSource);
    expect(seed.metadata?.mushroomPicking).toEqual(mushroomSource.metadata?.mushroomPicking);
    expect(seed.metadata?.mushroomPicking).not.toBe(mushroomSource.metadata?.mushroomPicking);
    expect(seed.metadata?.mushroomPicking?.equipment).not.toBe(mushroomSource.metadata?.mushroomPicking?.equipment);
  });
});
