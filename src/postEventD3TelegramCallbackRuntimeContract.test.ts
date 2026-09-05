/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEventNotificationTelegramReplyMarkup } from "./notifications/telegram-reply-markup";
import type { EventNotificationDelivery } from "./notifications/types";

const callback = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/postEventCallback.ts", import.meta.url),
  "utf8",
);
const callbackBase = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/postEventCallbackBase.ts", import.meta.url),
  "utf8",
);
const index = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url),
  "utf8",
);
const markup = readFileSync(
  new URL("./notifications/telegram-reply-markup.ts", import.meta.url),
  "utf8",
);

describe("POSTEVENT001 D3 / ChRem002B Telegram callback runtime contract", () => {
  it("keeps legacy and ChRem002B callback payloads inside Telegram's 64-byte limit", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const values = [
      `pe:q1:${id}:y`, `pe:q1:${id}:n`,
      `pe:q2:${id}:g`, `pe:q2:${id}:p`,
      `pe:q3:${id}:a`, `pe:q3:${id}:n`,
      `pe:q4:${id}:a`, `pe:q4:${id}:p`,
      `pe:q4d:${id}`,
      `pe:o:${id}:h`, `pe:o:${id}:n`, `pe:o:${id}:p`,
      `pe:p:${id}:a`, `pe:p:${id}:x`, `pe:p:${id}:n`,
    ];
    for (const value of values) expect(Buffer.byteLength(value, "utf8")).toBeLessThanOrEqual(64);
  });

  it("maps Telegram mutations only through actor-validating service-role RPCs", () => {
    expect(callbackBase).toContain('supabase.rpc("go_irl_post_event_telegram_action"');
    expect(callbackBase).toContain('supabase.rpc("go_irl_update_post_event_telegram_message_id"');
    expect(callbackBase).toContain('supabase.rpc("go_irl_schedule_post_event_telegram_cleanup"');
    expect(callbackBase).toContain("p_telegram_user_id: String(telegramUserId)");
    expect(callbackBase).toContain("p_action: parsed.action");
    expect(callbackBase).toContain("p_target_id: parsed.targetId");
    expect(callbackBase).toContain("p_value: parsed.value");
    expect(callbackBase).not.toContain("p_user_key");
  });

  it("routes POSTEVENT callbacks before repeat and preserves legacy fallback", () => {
    expect(index).toContain('import { handlePostEventCallback } from "./postEventCallback.ts"');
    expect(index).toContain("const postEventResult = await handlePostEventCallback");
    expect(index).toContain("const repeatResult = await handleRepeatPublicationCallback");
    expect(index.indexOf("handlePostEventCallback({")).toBeLessThan(
      index.indexOf("handleRepeatPublicationCallback({"),
    );
    expect(index).toContain("return legacyHandler!(request)");
  });

  it("preserves the fresh-main direct-join wrapper and delegates non-join callbacks to the base", () => {
    expect(callback).toContain('import * as base from "./postEventCallbackBase.ts"');
    expect(callback).toContain("handleActivityJoinCallback");
    expect(callback).toContain("return base.handlePostEventCallback(args)");
    expect(callbackBase).not.toContain("handleActivityJoinCallback");
  });

  it("uses the ChRem002B Q1 organizer callback and removes stacked organizer URLs", () => {
    expect(markup).toContain('buildOrganizerSurveyKeyboard(delivery.language, "outcome", eventId)');
    expect(markup).not.toContain('organizerCallback(eventId, "p")');
    const eventId = "123e4567-e89b-42d3-a456-426614174000";
    const item: EventNotificationDelivery = {
      id: "organizer-q1",
      userKey: "user:1",
      activityId: eventId,
      kind: "post_event.organizer_confirmation",
      payload: { eventId, postEventStage: "organizer_initial" },
      attemptCount: 0,
      provider: "telegram",
      recipientId: "123",
      language: "ru",
      openUrl: `https://go-irl.fun/join/${eventId}`,
    };
    const organizer = buildEventNotificationTelegramReplyMarkup(item, item.openUrl);
    expect(organizer.inline_keyboard).toEqual([[
      { text: "Да", callback_data: `pe:q1:${eventId}:y` },
      { text: "Нет", callback_data: `pe:q1:${eventId}:n` },
    ]]);
    expect(organizer.inline_keyboard.flat().some((button) => "url" in button)).toBe(false);

    const feedbackId = "223e4567-e89b-42d3-a456-426614174000";
    const participant = buildEventNotificationTelegramReplyMarkup({
      ...item,
      kind: "post_event.participant_confirmation",
      payload: { eventId, feedbackId, postEventStage: "participant_confirmation" },
    }, item.openUrl);
    expect(participant.inline_keyboard).toEqual([
      [
        { text: "Участвовал(а)", callback_data: `pe:p:${feedbackId}:a` },
        { text: "Не участвовал(а)", callback_data: `pe:p:${feedbackId}:x` },
      ],
      [{ text: "Событие не состоялось", callback_data: `pe:p:${feedbackId}:n` }],
      [{ text: "Открыть событие", url: item.openUrl }],
    ]);
  });

  it("replaces each organizer question and persists replacement message ids", () => {
    expect(callbackBase).toContain('telegramApi<boolean>("editMessageText"');
    expect(callbackBase).toContain('telegramApi<boolean>("deleteMessage"');
    expect(callbackBase).toContain('telegramApi<{ message_id: number }>("sendMessage"');
    expect(callbackBase).toContain("persistMessageAnchor");
  });
});
