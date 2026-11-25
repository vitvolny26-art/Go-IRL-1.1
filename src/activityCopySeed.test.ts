import { describe, expect, it } from "vitest";
import { buildActivityCopySeed, buildQuickRepeatInput } from "./activityCopySeed";
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
});

describe("buildQuickRepeatInput", () => {
  it("preserves source configuration and only replaces date/time", () => {
    const result = buildQuickRepeatInput(source, "2026-12-05", "20:30", "ru");
    expect(result).toMatchObject({
      type: "sport", categoryId: "sport", activityText: "Волейбол", titleText: "Игра",
      descriptionText: "Описание", date: "2026-12-05", time: "20:30",
      cityId: "prague", address: "Park", price: 100, capacity: 8, visibility: "invite",
      metadata: { sport: source.metadata?.sport },
    });
    for (const excluded of ["id", "organizerKey", "participants", "members", "seriesId"]) expect(result).not.toHaveProperty(excluded);
  });
  it("does not replicate previous chat/topic identity or invitations", () => {
    const event = {
      ...source,
      metadata: {
        ...source.metadata,
        initialInviteUserKeys: ["previous-member"],
        recurringInvite: { enabled: true, cadence: "weekly", leadDays: 2, autoInvitePreviousJoined: true, seriesKey: "old", occurrence: 3 },
        telegramCommunity: { chatId: 42, topicId: 77, messageId: 3, postedAt: "2026-09-01", signature: "old" },
      },
    } as Activity;
    const input = buildQuickRepeatInput(event, "2026-12-05", "20:30", "ru");
    expect(input.metadata).not.toHaveProperty("telegramCommunity");
    expect(input.metadata).not.toHaveProperty("recurringInvite");
    expect(input.metadata).not.toHaveProperty("initialInviteUserKeys");
    expect(input.metadata?.sport).toEqual(source.metadata?.sport);
  });
});
