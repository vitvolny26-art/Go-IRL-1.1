import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildTelegramEventCard } from "../api/_shared/telegram-event-card";

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
  it("renders immutable-photo card content as caption plus Details/Participate callbacks", () => {
    const card = buildTelegramEventCard(eventInput, "https://go-irl.fun/card.png");
    expect(card.photo_url).toBe("https://go-irl.fun/card.png");
    expect(card.caption).toContain("Evening run");
    expect(card.caption).toContain("05.09.2026 · 19:00");
    expect(card.reply_markup.inline_keyboard[0]).toEqual([
      { text: "Подробнее", url: eventInput.inviteUrl },
      { text: "Участвовать", callback_data: `join:${eventInput.eventId}` },
    ]);
  });

  it("updates tracked city card caption without replacing media or pinning", async () => {
    const source = await readSource("api/_shared/telegram-city-publication.ts");
    expect(source).toContain('"editMessageCaption"');
    expect(source).not.toContain('"editMessageMedia"');
    expect(source).toContain('method === "pinChatMessage"');
    expect(source).toContain("return true as T");
    expect(source).toContain('"reopenGeneralForumTopic"');
    expect(source).toContain('"closeGeneralForumTopic"');
  });

  it("republishes the tracked public city card after activity edits", async () => {
    const source = await readSource("src/activityShareCardPersistence.ts");
    expect(source).toContain("await publishCityActivity(activityId)");
    expect(source).toContain('input.visibility === "public" || current?.visibility === "public"');
  });

  it("keeps direct join callback behind the existing verified post-event callback boundary", async () => {
    const source = await readSource("supabase/functions/telegramEventSupergroup/postEventCallback.ts");
    expect(source).toContain("handleActivityJoinCallback");
    expect(source).toContain("handlePostEventCallbackBase");
  });
});
