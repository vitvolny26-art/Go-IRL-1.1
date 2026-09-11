import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildTelegramEventCard } from "../api/_shared/telegram-event-card";
import { resolveCityTelegramChatId } from "../api/_shared/telegram-city-publication-core";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const eventInput = {
  eventId: "11111111-1111-4111-8111-111111111111",
  title: "Evening run",
  activity: "Running",
  date: "05.09.2026",
  eventDate: "2026-09-05",
  time: "19:00",
  address: "Praha 1",
  participants: 3,
  capacity: 10,
  icon: "🏃",
  inviteUrl: "https://go-irl.fun/join/11111111-1111-4111-8111-111111111111",
  city: "Praha",
  price: 0,
  level: "all",
  format: "group",
  environment: "outdoor",
  language: "ru" as const,
};

describe("ChRem002A Telegram city card contract", () => {
  it("renders immutable-photo city card content as caption plus Details/Participate callbacks", () => {
    const card = buildTelegramEventCard(eventInput, "https://go-irl.fun/card.png");
    expect(card.photo_url).toBe("https://go-irl.fun/card.png");
    expect(card.caption).toContain("Evening run");
    expect(card.caption).toContain("05.09.2026 · 19:00");
    expect(card.reply_markup.inline_keyboard[0]).toEqual([
      { text: "Подробнее", url: eventInput.inviteUrl },
      { text: "Участвовать", callback_data: `join:${eventInput.eventId}` },
    ]);
  });

  it("keeps prepared personal event shares captionless while preserving the shared card builder", async () => {
    const source = await readSource("api/telegram/prepared-share.ts");
    expect(source).toContain('const personalCard = { ...buildTelegramEventCard(card, image.toString()), caption: "" }');
    expect(source).toContain("personalCard,");
  });

  it("publishes Kharkiv city activities to the canonical Telegram community", () => {
    expect(resolveCityTelegramChatId("kharkiv")).toBe(-1003919911341);
  });

  it("updates tracked city card caption without replacing media, pinning, or managing topics", async () => {
    const source = await readSource("api/_shared/telegram-city-publication.ts");
    expect(source).toContain('"editMessageCaption"');
    expect(source).not.toContain('"editMessageMedia"');
    expect(source).toContain('method === "pinChatMessage"');
    expect(source).toContain("return true as T");
    expect(source).not.toContain('"reopenGeneralForumTopic"');
    expect(source).not.toContain('"closeGeneralForumTopic"');
  });

  it("republishes the tracked public city card after activity edits", async () => {
    const source = await readSource("src/activityShareCardPersistence.ts");
    expect(source).toContain("await publishCityActivity(activityId)");
    expect(source).toContain('input.visibility === "public" || current?.visibility === "public"');
  });

  it("keeps direct join callback behind the existing verified post-event callback boundary", async () => {
    const source = await readSource("supabase/functions/telegramEventSupergroup/postEventCallback.ts");
    expect(source).toContain("handleActivityJoinCallback");
    expect(source).toContain('import * as base from "./postEventCallbackBase.ts"');
    expect(source).toContain("return base.handlePostEventCallback(args)");
  });

  it("preserves media for personalized join state and supports six-language Join/Leave UX", async () => {
    const source = await readSource("supabase/functions/telegramEventSupergroup/activityJoinCallbackBase.ts");
    expect(source).toContain('telegramApi("sendPhoto"');
    expect(source).toContain("sourcePhotoFileId(callbackQuery)");
    expect(source).not.toContain('telegramApi("sendMessage"');
    expect(source).toContain('telegramApi("editEphemeralMessageCaption"');
    expect(source).toContain('callback_data: `leave:${activity.id}`');
    expect(source).toContain('callback_data: `join:${activity.id}`');
    expect(source).toContain('pl: "pl-PL"');
    expect(source).toContain('sk: "sk-SK"');
    expect(source).toContain('en: "en-GB"');
    expect(source).toContain('`📍 ${activity.address.trim()}`');
    expect(source).toContain("formatEventDate(activity.event_date");
  });
});
