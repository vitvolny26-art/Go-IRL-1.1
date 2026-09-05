import { describe, expect, it } from "vitest";
import { buildTelegramBeautyCard, buildTelegramEventCard } from "./telegram-event-card";

const input = {
  eventId: "3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  title: "Волейбол <вечером>",
  activity: "Волейбол",
  date: "19 июл.",
  eventDate: "2026-07-19",
  time: "16:30",
  address: "ZŠ Demlova & park",
  participants: 3,
  capacity: 8,
  icon: "🏐",
  inviteUrl: "https://t.me/GOirl_bot?startapp=3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  mapUrl: "https://mapy.cz/zakladni?q=Z%C5%A0%20Demlova",
  city: "Оломоуц",
  durationMinutes: 90,
  price: 0,
  level: "Любитель",
  format: "Любительский",
  environment: "На улице",
  language: "ru" as const,
};

describe("buildTelegramEventCard", () => {
  it("builds a captionless photo with Details and Participate buttons", () => {
    const imageUrl = "https://go-irl.fun/api/meta/event-preview?alias=Vol260816_a&language=ru&format=image&v=14";
    const result = buildTelegramEventCard(input, imageUrl);

    expect(result.type).toBe("photo");
    expect(result.id).toBe(input.eventId);
    expect(result.photo_url).toBe(imageUrl);
    expect(result.caption).toBe("");
    expect(result.reply_markup.inline_keyboard[0]).toEqual([
      { text: "Подробнее", url: input.inviteUrl },
      { text: "Участвовать", callback_data: `join:${input.eventId}` },
    ]);
  });

  it("builds a 1080x900 Beauty photo with one profile button and no duplicated text", () => {
    const imageUrl = "https://go-irl.fun/api/meta/event-preview?slug=beauty-test&language=ru&format=image&v=14";
    const result = buildTelegramBeautyCard({
      ...input,
      activity: "Studio Vita",
      title: "Маникюр с гель-лаком",
      inviteUrl: "https://t.me/GOirl_bot?startapp=beauty-test",
    }, imageUrl);

    expect(result.type).toBe("photo");
    expect(result.photo_width).toBe(1080);
    expect(result.photo_height).toBe(900);
    expect(result.caption).toBe("");
    expect("title" in result).toBe(false);
    expect("description" in result).toBe(false);
    expect(result.reply_markup.inline_keyboard).toEqual([[{
      text: "Открыть профиль",
      url: "https://t.me/GOirl_bot?startapp=beauty-test",
    }]]);
  });

  it("does not build a calendar action from the localized compact date", () => {
    const result = buildTelegramEventCard({ ...input, eventDate: "" }, "https://example.com/card.jpg");
    expect(result.caption).toBe("");
    expect(result.reply_markup.inline_keyboard[0]).toEqual([
      { text: "Подробнее", url: input.inviteUrl },
      { text: "Участвовать", callback_data: `join:${input.eventId}` },
    ]);
  });

  it("does not expose a calendar CTA even when the event crosses into the next day", () => {
    const result = buildTelegramEventCard({
      ...input,
      eventDate: "2026-10-24",
      time: "23:30",
      durationMinutes: 90,
    }, "https://example.com/card.jpg");
    expect(result.reply_markup.inline_keyboard[0]).toEqual([
      { text: "Подробнее", url: input.inviteUrl },
      { text: "Участвовать", callback_data: `join:${input.eventId}` },
    ]);
  });
});
