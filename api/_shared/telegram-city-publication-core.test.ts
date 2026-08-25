import { describe, expect, it } from "vitest";
import {
  activityDurationMinutes,
  activityEndsAt,
  buildCitySendPhotoPayload,
  readCityTelegramPublicationState,
  resolveCityTelegramChatId,
  withCityTelegramPublicationState,
} from "./telegram-city-publication-core.js";

describe("city Telegram publication core", () => {
  it("maps supported cities and skips unknown destinations", () => {
    expect(resolveCityTelegramChatId("praha")).toBe(-1003976986591);
    expect(resolveCityTelegramChatId("olomouc")).toBe(-1004322361537);
    expect(resolveCityTelegramChatId("brno")).toBeNull();
  });

  it("uses the canonical Activity lifecycle duration contract", () => {
    expect(activityDurationMinutes({
      id: "a",
      event_date: "2026-08-25",
      event_time: "18:00:00",
      activity_type: "sport",
      metadata: { sport: { durationMinutes: 75 } },
    })).toBe(75);
    expect(activityDurationMinutes({
      id: "a",
      event_date: "2026-08-25",
      event_time: "18:00:00",
      activity_type: "sport",
      metadata: {},
    })).toBe(90);
    expect(activityDurationMinutes({
      id: "a",
      event_date: "2026-08-25",
      event_time: "18:00:00",
      activity_type: "social",
      metadata: {},
    })).toBe(120);
  });

  it("calculates summer and winter Prague end times with DST", () => {
    expect(activityEndsAt({
      id: "summer",
      event_date: "2026-08-25",
      event_time: "18:00:00",
      activity_type: "sport",
      metadata: { sport: { durationMinutes: 90 } },
    }).toISOString()).toBe("2026-08-25T17:30:00.000Z");
    expect(activityEndsAt({
      id: "winter",
      event_date: "2026-12-25",
      event_time: "18:00:00",
      activity_type: "sport",
      metadata: { sport: { durationMinutes: 90 } },
    }).toISOString()).toBe("2026-12-25T18:30:00.000Z");
  });

  it("rejects a nonexistent Prague DST wall time", () => {
    expect(() => activityEndsAt({
      id: "gap",
      event_date: "2026-03-29",
      event_time: "02:30:00",
      activity_type: "sport",
      metadata: {},
    })).toThrow("activity_time_invalid");
  });

  it("preserves unrelated metadata while tracking the exact message", () => {
    const state = {
      activityId: "event-id",
      active: true,
      chatId: -1003976986591,
      messageId: 42,
      pinnedAt: "2026-08-25T16:00:00.000Z",
      unpinAt: "2026-08-25T18:00:00.000Z",
    };
    const metadata = withCityTelegramPublicationState({
      repeatPublication: { enabled: true },
      sport: { durationMinutes: 90 },
    }, state);
    expect(metadata.repeatPublication).toEqual({ enabled: true });
    expect(readCityTelegramPublicationState(metadata)).toEqual(state);
  });

  it("maps the canonical inline photo card to sendPhoto without a text template", () => {
    expect(buildCitySendPhotoPayload(-1003976986591, {
      photo_url: "https://example.test/card.jpg",
      caption: "",
      reply_markup: { inline_keyboard: [[{ text: "Open", url: "https://example.test" }]] },
    })).toEqual({
      chat_id: -1003976986591,
      photo: "https://example.test/card.jpg",
      caption: "",
      reply_markup: { inline_keyboard: [[{ text: "Open", url: "https://example.test" }]] },
    });
  });
});
