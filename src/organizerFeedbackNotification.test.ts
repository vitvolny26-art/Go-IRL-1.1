import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localizeCanonicalActivityName } from "./activityOptionLocalization";
import { buildEventNotificationText } from "./notifications/message-builder";
import { buildEventNotificationTelegramReplyMarkup } from "./notifications/telegram-reply-markup";
import type { EventNotificationDelivery } from "./notifications/types";

const dispatcher = readFileSync(new URL("./notifications/dispatcher.ts", import.meta.url), "utf8");

const delivery = (language: EventNotificationDelivery["language"] = "ru"): EventNotificationDelivery => ({
  id: "organizer-feedback",
  userKey: "user:organizer",
  activityId: "123e4567-e89b-42d3-a456-426614174000",
  kind: "post_event.organizer_confirmation",
  payload: {
    eventId: "123e4567-e89b-42d3-a456-426614174000",
    postEventStage: "organizer_feedback",
    deliveryMode: "private_dm",
    title: {
      ru: "Волейбол",
      uk: "Волейбол",
      cs: "Volejbal",
      en: "Volleyball",
      pl: "Siatkówka",
      sk: "Volejbal",
    },
    eventDate: "2026-09-09",
    eventTime: "15:30:00",
    eventTimezone: "Europe/Prague",
    cityName: "Olomouc",
    address: "Křížíkova 278/1a, Olomouc",
    feedbackResponseCount: 3,
    feedbackRatingCount: 2,
    feedbackAverageRating: 3.5,
    feedbackTagCounts: { communication: 2, organization: 1 },
    feedbackRepeatYesCount: 2,
    feedbackRepeatNoCount: 1,
    feedbackSnapshotAt: "2026-09-11T18:00:00Z",
  },
  attemptCount: 1,
  provider: "telegram",
  recipientId: "123",
  language,
  openUrl: "https://go-irl.fun/join/123e4567-e89b-42d3-a456-426614174000",
});

describe("ChRem002B organizer feedback notification", () => {
  it("renders canonical Activity context before the anonymous aggregate", () => {
    const text = buildEventNotificationText(delivery());
    expect(text).toContain("Отзывы участников\nВолейбол\n2026-09-09 · 15:30\nOlomouc\nKřížíkova 278/1a, Olomouc");
    expect(text.indexOf("Волейбол")).toBeLessThan(text.indexOf("Ответов: 3"));
  });

  it("renders an anonymous aggregate without survey copy or participant identity", () => {
    const text = buildEventNotificationText(delivery());
    expect(text).toContain("Отзывы участников");
    expect(text).toContain("Ответов: 3");
    expect(text).toContain("Средняя оценка организатора: 3.5/5");
    expect(text).toContain("Коммуникация — 2");
    expect(text).toContain("Организация — 1");
    expect(text).toContain("Хотят повторить: 2");
    expect(text).toContain("Не хотят повторить: 1");
    expect(text).not.toContain("Состоялось ли это событие?");
    expect(text).not.toContain("participant");
    expect(text).not.toContain("feedbackId");
  });

  it("uses localized Activity title for every supported notification language", () => {
    const expectedTitles = {
      ru: "Волейбол",
      uk: "Волейбол",
      cs: "Volejbal",
      en: "Volleyball",
      pl: "Siatkówka",
      sk: "Volejbal",
    } as const;
    for (const language of ["ru", "uk", "cs", "en", "pl", "sk"] as const) {
      const text = buildEventNotificationText(delivery(language));
      expect(text).toContain(expectedTitles[language]);
      expect(text).toContain("2026-09-09 · 15:30");
      expect(text).toContain("Olomouc");
      expect(text).toContain("3.5/5");
      expect(text).toContain("2");
      expect(text).toContain("1");
    }
  });

  it("resolves canonical Activity names directly in Polish and Slovak", () => {
    const sourceNames = ["Волейбол", "Volejbal", "Volleyball"];
    expect(localizeCanonicalActivityName("sport", sourceNames, "pl")).toBe("Siatkówka");
    expect(localizeCanonicalActivityName("sport", sourceNames, "sk")).toBe("Volejbal");
  });

  it("omits a missing venue/address instead of inventing one", () => {
    const item = delivery();
    delete item.payload.address;
    const text = buildEventNotificationText(item);
    expect(text).toContain("Волейбол");
    expect(text).toContain("2026-09-09 · 15:30");
    expect(text).toContain("Olomouc");
    expect(text).not.toContain("Křížíkova");
  });

  it("has no Telegram actions for organizer feedback", () => {
    expect(buildEventNotificationTelegramReplyMarkup(delivery(), delivery().openUrl)).toEqual({ inline_keyboard: [] });
  });

  it("uses the existing trusted Activity enrichment path without participant data", () => {
    expect(dispatcher).toContain("loadTrustedTelegramEventCard(eventId, delivery.language, { includeParticipants: false })");
    expect(dispatcher).toContain("title: { ...delivery.payload.title, [delivery.language]: card.title }");
    expect(dispatcher).toContain("cityName: card.city");
    expect(dispatcher).toContain("address: delivery.payload.address || card.address");
    expect(dispatcher).toContain("const text = buildEventNotificationText(messageDelivery)");
    expect(dispatcher).toContain("buildEventNotificationTelegramReplyMarkup(messageDelivery, telegramOpenUrl)");
  });

  it("keeps a zero-response snapshot explicit while retaining Activity context", () => {
    const item = delivery();
    item.payload.feedbackResponseCount = 0;
    item.payload.feedbackRatingCount = 0;
    item.payload.feedbackAverageRating = null;
    item.payload.feedbackTagCounts = {};
    item.payload.feedbackRepeatYesCount = 0;
    item.payload.feedbackRepeatNoCount = 0;
    const text = buildEventNotificationText(item);
    expect(text).toContain("Волейбол");
    expect(text).toContain("2026-09-09 · 15:30");
    expect(text).toContain("Olomouc");
    expect(text).toContain("Ответов: 0");
    expect(text).toContain("Средняя оценка организатора: —");
    expect(text).toContain("Проблемы не отмечены");
  });
});
