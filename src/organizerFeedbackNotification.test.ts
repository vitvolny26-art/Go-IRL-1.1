import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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

  it("has localized aggregate copy for every supported notification language", () => {
    for (const language of ["ru", "uk", "cs", "en", "pl", "sk"] as const) {
      const text = buildEventNotificationText(delivery(language));
      expect(text.length).toBeGreaterThan(30);
      expect(text).toContain("3.5/5");
      expect(text).toContain("2");
      expect(text).toContain("1");
    }
  });

  it("renders no Telegram actions for organizer feedback", () => {
    expect(buildEventNotificationTelegramReplyMarkup(delivery(), delivery().openUrl)).toEqual({ inline_keyboard: [] });
  });

  it("stays on the existing dispatcher rendering path without adding feedback-specific delivery behavior", () => {
    expect(dispatcher).toContain("const text = buildEventNotificationText(messageDelivery)");
    expect(dispatcher).toContain("buildEventNotificationTelegramReplyMarkup(messageDelivery, telegramOpenUrl)");
    expect(dispatcher).not.toContain('postEventStage === "organizer_feedback"');
  });

  it("keeps a zero-response snapshot explicit instead of inventing feedback", () => {
    const item = delivery();
    item.payload.feedbackResponseCount = 0;
    item.payload.feedbackRatingCount = 0;
    item.payload.feedbackAverageRating = null;
    item.payload.feedbackTagCounts = {};
    item.payload.feedbackRepeatYesCount = 0;
    item.payload.feedbackRepeatNoCount = 0;
    const text = buildEventNotificationText(item);
    expect(text).toContain("Ответов: 0");
    expect(text).toContain("Средняя оценка организатора: —");
    expect(text).toContain("Проблемы не отмечены");
  });
});
