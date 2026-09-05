/// <reference types="node" />

import { describe, expect, it } from "vitest";
import { buildEventNotificationTelegramReplyMarkup } from "./notifications/telegram-reply-markup";
import type { EventNotificationDelivery } from "./notifications/types";

const base = {
  id: "notification-1",
  userKey: "u1",
  attemptCount: 0,
  provider: "telegram",
  recipientId: "123",
  language: "ru",
  openUrl: "https://go-irl.fun/event/123",
} as const;

describe("POSTEVENT001 D3 Telegram reply markup", () => {
  it("builds ChRem002B organizer Q1 as exactly two localized actions in one row", () => {
    const eventId = "123e4567-e89b-42d3-a456-426614174000";
    const delivery: EventNotificationDelivery = {
      ...base,
      activityId: eventId,
      kind: "post_event.organizer_confirmation",
      payload: { eventId, postEventStage: "organizer_initial" },
    };
    const markup = buildEventNotificationTelegramReplyMarkup(delivery, base.openUrl);
    expect(markup.inline_keyboard).toHaveLength(1);
    expect(markup.inline_keyboard[0]).toEqual([
      { text: "Да", callback_data: `pe:q1:${eventId}:y` },
      { text: "Нет", callback_data: `pe:q1:${eventId}:n` },
    ]);
    expect(markup.inline_keyboard.flat().some((button) => "url" in button)).toBe(false);
  });

  it("keeps participant D3 actions on feedback id", () => {
    const eventId = "123e4567-e89b-42d3-a456-426614174000";
    const feedbackId = "223e4567-e89b-42d3-a456-426614174000";
    const delivery: EventNotificationDelivery = {
      ...base,
      activityId: eventId,
      kind: "post_event.participant_confirmation",
      payload: { eventId, feedbackId, postEventStage: "participant_confirmation" },
    };
    const markup = buildEventNotificationTelegramReplyMarkup(delivery, base.openUrl);
    const callbacks = markup.inline_keyboard.flat()
      .flatMap((button) => "callback_data" in button ? [button.callback_data] : []);
    expect(callbacks).toContain(`pe:p:${feedbackId}:a`);
    expect(callbacks).toContain(`pe:p:${feedbackId}:x`);
    expect(callbacks).toContain(`pe:p:${feedbackId}:n`);
    expect(callbacks.some((value) => value.includes(eventId))).toBe(false);
  });

  it("does not render a keyboard for organizer cleanup delivery", () => {
    const eventId = "123e4567-e89b-42d3-a456-426614174000";
    const delivery: EventNotificationDelivery = {
      ...base,
      activityId: eventId,
      kind: "post_event.organizer_confirmation",
      payload: { eventId, postEventStage: "organizer_cleanup", telegramMessageId: "44" },
    };
    expect(buildEventNotificationTelegramReplyMarkup(delivery, base.openUrl)).toEqual({ inline_keyboard: [] });
  });
});
