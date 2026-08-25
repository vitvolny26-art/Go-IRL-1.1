import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderTelegramActivityShareCardJpeg, TELEGRAM_ACTIVITY_SHARE_HEIGHT, TELEGRAM_ACTIVITY_SHARE_WIDTH } from "./telegram-activity-share-card-image";
import type { TelegramEventCardInput } from "./telegram-event-card";

const card: TelegramEventCardInput = {
  eventId: "3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  title: "Волейбол",
  activity: "Волейбол",
  date: "19 июл",
  eventDate: "2026-07-19",
  time: "16:30",
  address: "ZŠ Demlova",
  participants: 2,
  capacity: 12,
  icon: "🏐",
  inviteUrl: "https://t.me/GOirl_bot?startapp=3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  city: "Оломоуц",
  price: 0,
  level: "Любитель",
  format: "Любительский",
  environment: "На улице",
  language: "ru",
};

describe("Telegram Activity share-card format", () => {
  it("renders the prepared-share JPEG at the canonical 4:3 size", async () => {
    const jpeg = await renderTelegramActivityShareCardJpeg(card);
    const metadata = await sharp(jpeg).metadata();
    expect(TELEGRAM_ACTIVITY_SHARE_WIDTH).toBe(1200);
    expect(TELEGRAM_ACTIVITY_SHARE_HEIGHT).toBe(900);
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(900);
    expect(jpeg.length).toBeLessThan(5 * 1024 * 1024);
  });
});
