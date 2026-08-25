import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildMetaInvitationCardSvg, buildTelegramShareCardSvg } from "./telegram-share-card-svg";
import { buildMetaInvitationCtaSvg, configureTelegramShareCardFonts, hasEventShareBackground, renderMetaInvitationCardJpeg, renderTelegramShareCardJpeg } from "./telegram-share-card-image";
import type { TelegramEventCardInput } from "./telegram-event-card";

const card: TelegramEventCardInput = {
  eventId: "3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  title: "Волейбол на ZŠ Demlova <вечером>",
  activity: "Волейбол",
  date: "19 июл",
  eventDate: "2026-07-19",
  time: "16:30",
  address: "ZŠ Demlova & park",
  participants: 2,
  capacity: 12,
  icon: "🏐",
  inviteUrl: "https://t.me/GOirl_bot?startapp=3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  city: "Оломоуц",
  organizer: "Vitalii Pashyn",
  durationMinutes: 90,
  price: 0,
  level: "Любитель",
  format: "Любительский",
  environment: "На улице",
  isSport: true,
  language: "ru",
};

describe("Telegram event share-card image", () => {
  it("renders the transparent original-card composition on the native 4:3 Telegram canvas", () => {
    const svg = buildTelegramShareCardSvg(card);
    expect(svg).toContain('width="1200" height="900"');
    expect(svg).toContain('viewBox="0 0 1200 900"');
    expect(svg).toContain('transform="translate(60 0)"');
    expect(svg).toContain('data-card-frame="expanded" x="18" y="18" width="1164"');
    expect(svg).toContain("Волейбол на ZŠ");
    expect(svg).toContain("&lt;вечером&gt;");
    expect(svg).toContain("ZŠ Demlova");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("park");
    expect(svg).toContain(">V</text>");
    expect(svg).toContain('data-organizer-avatar-slot="soft-square"');
    expect(svg).toContain('rx="16"');
    expect(svg).not.toContain(">Vitalii Pashyn<");
    expect(svg).not.toContain('x1="58" y1="690"');
    expect(svg).not.toContain('data-share-participants');
    expect(svg).not.toContain("2 / 8");
    expect(svg).toContain('data-share-footer="two-row"');
    expect(svg).not.toContain("90 мин");
    expect(svg).not.toContain("Нужен тренер");
    expect(svg).not.toContain("Подробнее");
    expect(svg).not.toContain(">Открыть<");
    expect(svg).not.toContain('width="440" height="116"');
    expect(svg).not.toContain('width="230" height="230"');
    expect(svg).not.toContain("data-event-artwork");
    expect(svg).toContain("DejaVu Sans");
    expect(svg).not.toContain("Arial");
    expect(svg).toContain('x="76" y="108"');
    expect(svg).toContain('x="76" y="208"');
  });

  it("shows weather only when weather data is present", () => {
    const withoutWeather = buildTelegramShareCardSvg(card);
    expect(withoutWeather).not.toContain("19°C");
    expect(withoutWeather).not.toContain("60%");
    expect(withoutWeather).not.toContain("6 km/h");

    const withWeather = buildTelegramShareCardSvg({
      ...card,
      weather: { icon: "🌧️", temperature: 19, rain: 60, wind: 6 },
    });
    expect(withWeather).toContain("19°C");
    expect(withWeather).toContain("60%");
    expect(withWeather).toContain("6 km/h");
    expect(withWeather).toContain('data-weather-lines="three"');
    expect(withWeather).not.toContain("data-weather-condition");
    expect(withWeather.match(/data-weather-icon=/g)).toHaveLength(3);
  });

  it("resolves approved category artwork as the full-card JPEG background", () => {
    expect(hasEventShareBackground(card)).toBe(true);
    expect(hasEventShareBackground({ ...card, activity: "Ролики", title: "Ролики" })).toBe(true);
    expect(hasEventShareBackground({ ...card, icon: "", activity: "Пользовательское событие", title: "Пользовательское событие" })).toBe(false);
  });

  it("bundles regular and bold Cyrillic fonts for serverless rendering", () => {
    const fonts = configureTelegramShareCardFonts();
    expect(fonts.regularFont).toMatch(/DejaVuSans\.ttf$/);
    expect(fonts.boldFont).toMatch(/DejaVuSans-Bold\.ttf$/);
    expect(existsSync(fonts.regularFont)).toBe(true);
    expect(existsSync(fonts.boldFont)).toBe(true);
    expect(existsSync(fonts.configFile)).toBe(true);
  });

  it("produces a native 1200x900 Telegram JPEG without side letterboxing", async () => {
    const jpeg = await renderTelegramShareCardJpeg(card);
    const metadata = await sharp(jpeg).metadata();
    const topLeftStats = await sharp(jpeg).extract({ left: 40, top: 40, width: 300, height: 260 }).stats();
    const bottomRightStats = await sharp(jpeg).extract({ left: 860, top: 560, width: 300, height: 260 }).stats();
    const leftEdgeStats = await sharp(jpeg).extract({ left: 28, top: 300, width: 28, height: 240 }).stats();
    const rightEdgeStats = await sharp(jpeg).extract({ left: 1144, top: 300, width: 28, height: 240 }).stats();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(900);
    expect(jpeg.length).toBeLessThan(5 * 1024 * 1024);
    expect(topLeftStats.isOpaque).toBe(true);
    expect(bottomRightStats.isOpaque).toBe(true);
    expect(topLeftStats.channels.some((channel) => channel.stdev > 15)).toBe(true);
    expect(bottomRightStats.channels.some((channel) => channel.stdev > 15)).toBe(true);
    expect(leftEdgeStats.channels.some((channel) => channel.stdev > 5)).toBe(true);
    expect(rightEdgeStats.channels.some((channel) => channel.stdev > 5)).toBe(true);
  });

  it("uses leading emoji for background detection but removes it from visible text", () => {
    const languageCard = {
      ...card,
      icon: "",
      activity: "🗣️ Языковой обмен",
      title: "🗣️ Английский",
    };
    const telegramSvg = buildTelegramShareCardSvg(languageCard);
    const metaSvg = buildMetaInvitationCardSvg(languageCard);

    expect(hasEventShareBackground(languageCard)).toBe(true);
    expect(telegramSvg).toContain("Языковой обмен");
    expect(telegramSvg).toContain("Английский");
    expect(telegramSvg).not.toContain("🗣️");
    expect(metaSvg).toContain("Языковой обмен");
    expect(metaSvg).toContain("Английский");
    expect(metaSvg).not.toContain("🗣️");
    expect(metaSvg).not.toBe(telegramSvg);
  });

  it("keeps the Meta composition at its existing 1080px contract", async () => {
    const metaCard = {
      ...card,
      weather: { icon: "🌤️", temperature: 23, rain: 12, wind: 19 },
    };
    const svg = buildMetaInvitationCardSvg(metaCard);
    expect(svg).toContain('width="1080" height="900"');
    expect(svg).toContain('transform="translate(0 0)"');
    expect(svg).toContain("23°C");
    expect(svg).toContain("12%");
    expect(svg).toContain("19 km/h");
    expect(svg).toContain('data-weather-lines="three"');
    expect(svg).not.toContain("data-weather-condition");
    expect(svg).not.toContain("data-event-artwork");

    const jpeg = await renderMetaInvitationCardJpeg(metaCard);
    const metadata = await sharp(jpeg).metadata();
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1020);
    expect(jpeg.length).toBeLessThan(5 * 1024 * 1024);
  });

  it("adds a localized details CTA below the WhatsApp image without changing Telegram", () => {
    expect(buildMetaInvitationCtaSvg({ ...card, language: "ru" })).toContain("Подробнее");
    expect(buildMetaInvitationCtaSvg({ ...card, language: "uk" })).toContain("Детальніше");
    expect(buildMetaInvitationCtaSvg({ ...card, language: "cs" })).toContain("Více informací");
    expect(buildMetaInvitationCtaSvg({ ...card, language: "en" })).toContain("More details");
    expect(buildTelegramShareCardSvg(card)).not.toContain("Подробнее");
  });
});
