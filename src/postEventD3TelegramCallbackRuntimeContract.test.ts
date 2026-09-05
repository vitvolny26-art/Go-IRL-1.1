/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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

describe("POSTEVENT001 D3 Telegram callback runtime contract", () => {
  it("uses compact callback data within Telegram's 64-byte limit", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const values = [
      `pe:o:${id}:h`,
      `pe:o:${id}:n`,
      `pe:o:${id}:p`,
      `pe:p:${id}:a`,
      `pe:p:${id}:x`,
      `pe:p:${id}:n`,
    ];
    for (const value of values) expect(Buffer.byteLength(value, "utf8")).toBeLessThanOrEqual(64);
  });

  it("maps Telegram identity only through the service-role SQL bridge", () => {
    expect(callbackBase).toContain('supabase.rpc("go_irl_post_event_telegram_action"');
    expect(callbackBase).toContain("p_telegram_user_id: String(telegramUserId)");
    expect(callbackBase).toContain("p_action: parsed.action");
    expect(callbackBase).toContain("p_target_id: parsed.targetId");
    expect(callbackBase).toContain("p_value: parsed.value");
    expect(callbackBase).not.toContain("user_key");
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

  it("delegates non-join callbacks to the verified POSTEVENT base implementation", () => {
    expect(callback).toContain('import * as base from "./postEventCallbackBase.ts"');
    expect(callback).toContain("handleActivityJoinCallback");
    expect(callback).toContain("return base.handlePostEventCallback(args)");
  });

  it("adds bounded organizer and participant callback buttons plus app fallback", () => {
    expect(markup).toContain('delivery.kind === "post_event.organizer_confirmation"');
    expect(markup).toContain('delivery.kind === "post_event.participant_confirmation"');
    expect(markup).toContain('callback_data: organizerCallback(eventId, "h")');
    expect(markup).toContain('callback_data: participantCallback(feedbackId, "a")');
    expect(markup).toContain("[openButton]");
  });

  it("removes action buttons after a durable callback but retains URL buttons", () => {
    expect(callbackBase).toContain("retainedUrlKeyboard");
    expect(callbackBase).toContain('telegramApi<boolean>("editMessageReplyMarkup"');
    expect(callbackBase).toContain('typeof button.url === "string"');
    expect(callbackBase).toContain("Mutation is durable; action-button cleanup is best-effort only.");
  });
});
