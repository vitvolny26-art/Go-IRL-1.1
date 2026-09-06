import { describe, expect, it } from "vitest";
import { normalizeTelegramEventCardInput } from "./telegram-event-card-input";

const required = {
  eventId: "3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  inviteUrl: "https://t.me/GOirl_bot?startapp=3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  language: "ru",
};

describe("normalizeTelegramEventCardInput", () => {
  it("keeps the secure core and normalizes optional legacy values", () => {
    expect(normalizeTelegramEventCardInput({
      ...required,
      title: "Волейбол",
      activity: "Волейбол",
      organizer: "  Vitalii Pashyn  ",
      organizerKey: "telegram:1",
      organizerAvatarUrl: "https://t.me/i/userpic/320/example.jpg",
      eventDate: "2026-07-19",
      participants: "2",
      capacity: "12",
      price: "0",
      durationMinutes: 0,
      mapUrl: "http://legacy.example/map",
      weather: { temperature: null, rain: 12, wind: 19 },
    })).toMatchObject({
      organizer: "Vitalii Pashyn",
      organizerKey: "telegram:1",
      organizerAvatarUrl: "https://t.me/i/userpic/320/example.jpg",
      participants: 2,
      capacity: 12,
      price: 0,
      eventDate: "2026-07-19",
      durationMinutes: 15,
      mapUrl: undefined,
      weather: undefined,
    });
  });

  it.each(["pl", "sk"] as const)("accepts the %s Telegram Activity language", (language) => {
    expect(normalizeTelegramEventCardInput({ ...required, language })?.language).toBe(language);
  });

  it("rejects an invalid event id, language or invitation target", () => {
    expect(normalizeTelegramEventCardInput({ ...required, eventId: "bad" })).toBeNull();
    expect(normalizeTelegramEventCardInput({ ...required, language: "de" })).toBeNull();
    expect(normalizeTelegramEventCardInput({ ...required, inviteUrl: "https://example.com" })).toBeNull();
  });
});
