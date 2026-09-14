import { describe, expect, it } from "vitest";
import type { Activity } from "../types";
import {
  participantCardSelector,
  resolveParticipantActivity,
  resolveParticipantMember,
} from "./ParticipantIdentityPortal";

const activity = (overrides: Partial<Activity> = {}): Activity => ({
  id: "activity-1",
  categoryId: "sport",
  activity: { ru: "Волейбол", uk: "Волейбол", cs: "Volejbal", en: "Volleyball" , pl: "Volleyball", sk: "Volejbal"},
  title: { ru: "Вечерний волейбол", uk: "Вечірній волейбол", cs: "Večerní volejbal", en: "Evening volleyball" , pl: "Evening volleyball", sk: "Večerní volejbal"},
  description: { ru: "Игра после работы", uk: "Гра після роботи", cs: "Hra po práci", en: "After-work game" , pl: "After-work game", sk: "Hra po práci"},
  date: "2026-07-25",
  time: "18:00",
  cityId: "olomouc",
  address: "Olomouc",
  price: 0,
  capacity: 8,
  participants: 3,
  members: [
    { userKey: "telegram:1", name: "Alex", status: "joined" },
    { userKey: "telegram:2", name: "Alex", status: "joined" },
    { userKey: "telegram:3", name: "Waiting User", status: "waiting" },
  ],
  organizer: "Organizer",
  organizerKey: "telegram:organizer",
  visibility: "public",
  ...overrides,
});

describe("participant identity portal matching", () => {
  it("supports both generic and sport event cards", () => {
    expect(participantCardSelector).toBe(".activity-card, .sport-card");
  });

  it("uses the current language and secondary text to disambiguate cards", () => {
    const first = activity();
    const second = activity({
      id: "activity-2",
      title: { ru: "Утренний волейбол", uk: "Ранковий волейбол", cs: "Ranní volejbal", en: "Morning volleyball" , pl: "Morning volleyball", sk: "Ranní volejbal"},
    });

    const resolved = resolveParticipantActivity([first, second], "en", {
      context: "card",
      primaryText: "Volleyball",
      secondaryText: "Evening volleyball",
    });

    expect(resolved?.id).toBe("activity-1");
  });

  it("returns null when a card remains ambiguous", () => {
    const duplicate = activity({ id: "activity-2" });

    expect(resolveParticipantActivity([activity(), duplicate], "en", {
      context: "card",
      primaryText: "Volleyball",
    })).toBeNull();
  });

  it("keeps duplicate participant names aligned by status position", () => {
    const source = activity();

    expect(resolveParticipantMember(source, "joined", 0, "Alex")?.userKey).toBe("telegram:1");
    expect(resolveParticipantMember(source, "joined", 1, "Alex")?.userKey).toBe("telegram:2");
    expect(resolveParticipantMember(source, "waiting", 0, "Waiting User")?.userKey).toBe("telegram:3");
  });

  it("does not guess an identity when duplicate names cannot be positioned", () => {
    expect(resolveParticipantMember(activity(), "joined", 4, "Alex")).toBeNull();
  });
});
