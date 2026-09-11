import { describe, expect, it } from "vitest";
import {
  activityDurationMinutes,
  activityEndsAt,
  buildCitySendPhotoPayload,
  readCityTelegramPublicationState,
  resolveCityTelegramBeautyHealthTopicId,
  resolveCityTelegramChatId,
  resolveCityTelegramPublicationKind,
  resolveCityTelegramTopicId,
  resolveCityTelegramUsername,
  withCityTelegramPublicationState,
} from "./telegram-city-publication-core.js";

describe("city Telegram publication core", () => {
  it("maps verified numeric destinations without inventing unknown chat ids", () => {
    expect(resolveCityTelegramChatId("praha")).toBe(-1003976986591);
    expect(resolveCityTelegramChatId("olomouc")).toBe(-1004451765209);
    expect(resolveCityTelegramChatId("kharkiv")).toBe(-1003919911341);
    expect(resolveCityTelegramChatId("brno")).toBeNull();
    expect(resolveCityTelegramChatId("dnipro")).toBeNull();
  });

  it("records the verified public city usernames and Beauty/Health topics", () => {
    expect(resolveCityTelegramUsername("olomouc")).toBe("GoIRL_Olomouc");
    expect(resolveCityTelegramUsername("warszawa")).toBe("GoIRL_Warshava");
    expect(resolveCityTelegramUsername("ostrava")).toBe("Go_IRL_Ostrava");
    expect(resolveCityTelegramUsername("brno")).toBe("Go_IRL_Brno");
    expect(resolveCityTelegramBeautyHealthTopicId("olomouc")).toBe(45);
    expect(resolveCityTelegramBeautyHealthTopicId("kharkiv")).toBe(21);
    expect(resolveCityTelegramBeautyHealthTopicId("dnipro")).toBe(13);
    expect(resolveCityTelegramBeautyHealthTopicId("praha")).toBe(12);
    expect(resolveCityTelegramBeautyHealthTopicId("lviv")).toBe(12);
    expect(resolveCityTelegramBeautyHealthTopicId("warszawa")).toBe(12);
    expect(resolveCityTelegramBeautyHealthTopicId("ostrava")).toBe(11);
    expect(resolveCityTelegramBeautyHealthTopicId("brno")).toBe(11);
  });

  it("routes all 40 canonical cards deterministically", () => {
    const cases = [
      ["Волейбол", "sport"], ["Футбол", "sport"], ["Баскетбол", "sport"], ["Теннис", "sport"],
      ["Тренажёрный зал", "sport"], ["Бег", "sport"], ["Велосипед", "sport"], ["Бадминтон", "sport"],
      ["Настольный теннис", "sport"], ["Йога", "sport"],
      ["Кофе", "chat"], ["Кино", "culture"], ["Боулинг", "games"], ["Настольные игры", "games"],
      ["Шахматы", "games"], ["Караоке", "music"], ["Ролики", "sport"],
      ["Идём на пиво", "chat"], ["Паб-квиз", "games"], ["Винный вечер", "chat"], ["Концерт", "music"],
      ["Фестиваль", "festival"], ["Танцы", "music"],
      ["Поход", "outdoor"], ["Прогулка в парке", "outdoor"], ["Плавание", "sport"], ["Пикник", "outdoor"],
      ["Кемпинг", "outdoor"], ["Рыбалка", "outdoor"], ["Каяки", "outdoor"],
      ["Прогулка", "chat"], ["Ужин", "chat"], ["Языковой обмен", "education"], ["Коворкинг", "education"],
      ["Новые знакомства", "chat"],
      ["Рисование", "culture"], ["Фотопрогулка", "culture"], ["Керамика", "culture"],
      ["Музыкальный джем", "music"], ["Мастерская", "culture"],
    ] as const;

    expect(cases).toHaveLength(40);
    for (const [activity_ru, kind] of cases) {
      expect(resolveCityTelegramPublicationKind({ activity_ru })).toBe(kind);
    }
  });

  it("routes supported city publications to the standardized forum topics", () => {
    expect(resolveCityTelegramTopicId("kharkiv", { activity_type: "custom", activity_ru: "Футбол" })).toBe(5);
    expect(resolveCityTelegramTopicId("olomouc", { activity_type: "custom", activity_ru: "Футбол" })).toBe(5);
    expect(resolveCityTelegramTopicId("praha", { activity_type: "custom", activity_ru: "Кофе" })).toBe(2);
    expect(resolveCityTelegramTopicId("praha", { activity_type: "custom", activity_ru: "Караоке" })).toBe(3);
    expect(resolveCityTelegramTopicId("praha", { activity_type: "custom", activity_ru: "Кино" })).toBe(4);
    expect(resolveCityTelegramTopicId("brno", { activity_ru: "Настольные игры" })).toBe(8);
  });

  it("keeps Festival separate from Music and never sends a normal activity to General", () => {
    expect(resolveCityTelegramPublicationKind({ activity_ru: "Фестиваль" })).toBe("festival");
    expect(resolveCityTelegramPublicationKind({ title_ru: "Oktoberfest Brno" })).toBe("festival");
    expect(resolveCityTelegramTopicId("brno", { activity_ru: "Фестиваль" })).toBe(2);
  });

  it("uses category/type/keyword only after exact canonical card routing", () => {
    expect(resolveCityTelegramPublicationKind({ category_id: "sport", activity_type: "custom", activity_ru: "Своя тренировка" })).toBe("sport");
    expect(resolveCityTelegramPublicationKind({ activity_type: "custom", title_ru: "Футбол во дворе" })).toBe("sport");
    expect(resolveCityTelegramPublicationKind({ activity_type: "custom", title_ru: "Неизвестная встреча" })).toBe("chat");
    expect(resolveCityTelegramPublicationKind({ category_id: "creativity", activity_ru: "Фотопрогулка" })).toBe("culture");
  });

  it("uses the canonical Activity lifecycle duration contract", () => {
    expect(activityDurationMinutes({ id: "a", event_date: "2026-08-25", event_time: "18:00:00", activity_type: "sport", metadata: { sport: { durationMinutes: 75 } } })).toBe(75);
    expect(activityDurationMinutes({ id: "a", event_date: "2026-08-25", event_time: "18:00:00", activity_type: "sport", metadata: {} })).toBe(90);
    expect(activityDurationMinutes({ id: "a", event_date: "2026-08-25", event_time: "18:00:00", activity_type: "social", metadata: {} })).toBe(120);
  });

  it("calculates summer and winter Prague end times with DST", () => {
    expect(activityEndsAt({ id: "summer", event_date: "2026-08-25", event_time: "18:00:00", activity_type: "sport", metadata: { sport: { durationMinutes: 90 } } }).toISOString()).toBe("2026-08-25T17:30:00.000Z");
    expect(activityEndsAt({ id: "winter", event_date: "2026-12-25", event_time: "18:00:00", activity_type: "sport", metadata: { sport: { durationMinutes: 90 } } }).toISOString()).toBe("2026-12-25T18:30:00.000Z");
  });

  it("rejects a nonexistent Prague DST wall time", () => {
    expect(() => activityEndsAt({ id: "gap", event_date: "2026-03-29", event_time: "02:30:00", activity_type: "sport", metadata: {} })).toThrow("activity_time_invalid");
  });

  it("preserves unrelated metadata while tracking the exact message", () => {
    const state = { activityId: "event-id", active: true, chatId: -1003976986591, messageId: 42, messageThreadId: 5, pinnedAt: "2026-08-25T16:00:00.000Z", unpinAt: "2026-08-25T18:00:00.000Z" };
    const metadata = withCityTelegramPublicationState({ repeatPublication: { enabled: true }, sport: { durationMinutes: 90 } }, state);
    expect((metadata as Record<string, unknown>).repeatPublication).toEqual({ enabled: true });
    expect(readCityTelegramPublicationState(metadata)).toEqual(state);
    expect(readCityTelegramPublicationState({ cityTelegramPublication: { activityId: "legacy-event", active: true, chatId: -1003919911341, messageId: 17, pinnedAt: "2026-09-10T10:00:00.000Z", unpinAt: "2026-09-10T12:00:00.000Z" } })?.messageThreadId).toBeUndefined();
  });

  it("maps the canonical inline photo card to the selected forum topic", () => {
    expect(buildCitySendPhotoPayload(-1003976986591, { photo_url: "https://example.test/card.jpg", caption: "", reply_markup: { inline_keyboard: [[{ text: "Open", url: "https://example.test" }]] } }, 5)).toEqual({ chat_id: -1003976986591, photo: "https://example.test/card.jpg", caption: "", reply_markup: { inline_keyboard: [[{ text: "Open", url: "https://example.test" }]] }, message_thread_id: 5 });
    expect(buildCitySendPhotoPayload(-1003976986591, { photo_url: "https://example.test/card.jpg" })).not.toHaveProperty("message_thread_id");
  });
});
