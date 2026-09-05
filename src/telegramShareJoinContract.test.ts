/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync(new URL("../api/_shared/telegram-event-card.ts", import.meta.url), "utf8");
const handler = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/activityJoinCallback.ts", import.meta.url),
  "utf8",
);
const index = readFileSync(new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url), "utf8");

describe("Telegram Share join callback contract", () => {
  it("adds Details and Participate actions to an event share card", () => {
    expect(card).toContain('details: "Подробнее"');
    expect(card).toContain('join: "Участвовать"');
    expect(card).toContain('callback_data: `join:${input.eventId}`');
    expect(card).toContain("url: input.inviteUrl");
  });

  it("routes join callbacks only behind the verified Telegram webhook boundary", () => {
    const webhookBoundary = index.indexOf("const webhookAuthorized = safeEqual");
    const joinHandler = index.indexOf("const activityJoinResult = await handleActivityJoinCallback");
    expect(webhookBoundary).toBeGreaterThan(-1);
    expect(joinHandler).toBeGreaterThan(webhookBoundary);
  });

  it("resolves the existing Telegram identity before creating a Telegram-native app user", () => {
    const identityLookup = handler.indexOf('.from("user_provider_identities")');
    const deletedLookup = handler.indexOf('.from("deleted_provider_identities")');
    const userUpsert = handler.indexOf('.from("app_users").upsert');
    expect(identityLookup).toBeGreaterThan(-1);
    expect(deletedLookup).toBeGreaterThan(identityLookup);
    expect(userUpsert).toBeGreaterThan(deletedLookup);
    expect(handler).toContain('const userKey = `telegram:${providerUserId}`');
  });

  it("writes participation into the canonical activity_members table and never toggles join into leave", () => {
    expect(handler).toContain('.from("activity_members").insert');
    expect(handler).toContain('status: status as MemberStatus');
    expect(handler).not.toContain('.from("activity_members").delete');
  });

  it("preserves current web membership semantics without SQL or migration changes", () => {
    expect(handler).toContain('activity.visibility === "private"');
    expect(handler).toContain('activity.visibility === "invite"');
    expect(handler).toContain('status = "pending"');
    expect(handler).toContain('status = Number(joinedResult.count || 0) >= activity.capacity ? "full" : "joined"');
  });

  it("uses Telegram ephemeral replacement only when the callback exposes a real group chat id", () => {
    expect(handler).toContain("const chatId = callbackQuery.message?.chat?.id");
    expect(handler).toContain('!["group", "supergroup"].includes(chatType || "")');
    expect(handler).toContain("ephemeral_message_parameters");
    expect(handler).toContain("receiver_user_id: telegramUserId");
    expect(handler).toContain("callback_query_id: callbackId");
    expect(handler).toContain("replace_callback_query_message: true");
    expect(handler).toContain('telegramApi<boolean>("answerCallbackQuery"');
    expect(handler).toContain('if (status === "waiting") return "waitlisted"');
  });
});
