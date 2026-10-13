import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Activ020 prepared Telegram photo invitation", () => {
  it("renders the signed image snapshot without the persisted re-fetch mode", async () => {
    const src = await readFile(new URL("../api/telegram/prepared-share.ts", import.meta.url), "utf8");
    const start = src.indexOf("async function prepareEventShare(");
    const end = src.indexOf("export default async function handler", start);
    const event = src.slice(start, end);
    expect(event).toContain('new URL("/api/telegram/event-share-card", telegramMediaOrigin)');
    expect(event).toContain('createTelegramShareCardToken(card, botToken)');
    expect(event).not.toContain('image.searchParams.set("mode", "persisted")');
    expect(event).toContain('ru: { intro: "Вас приглашают на встречу", open: "Подробнее", join: "Иду", decline: "Не иду" }');
    expect(event).toContain('callback_data: `invitejoin:${card.eventId}`');
    expect(event).toContain('callback_data: `decline:${card.eventId}`');
    expect(event).toContain("type");
  });
});
