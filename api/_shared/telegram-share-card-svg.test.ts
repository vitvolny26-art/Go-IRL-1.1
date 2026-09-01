import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildMetaInvitationCardSvg, buildTelegramShareCardSvg, SPORT_SHARE_AVATAR_LEFT } from "./telegram-share-card-svg";
import { buildMetaInvitationCtaSvg, configureTelegramShareCardFonts, hasEventShareBackground, renderMetaInvitationCardJpeg, renderTelegramShareCardJpeg } from "./telegram-share-card-image";
import type { TelegramEventCardInput } from "./telegram-event-card";

const card: TelegramEventCardInput = {
  eventId: "3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  title: "Волейбол на ZŠ Demlova <вечером>",
  activity: "Волейбол",
  description: "ZŠ Zeyerova",
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

const dividerValue = (svg: string, attribute: "data-date-divider" | "data-price-divider") => {
  const match = svg.match(new RegExp(`${attribute}="(\\d+)"`));
  return match ? Number(match[1]) : 0;
};

describe("Telegram event share-card image", () => {
  it("renders the transparent original-card composition on the native 4:3 Telegram canvas", () => {
    const svg = buildTelegramShareCardSvg(card);
    expect(svg).toContain('width="1200" height="900"');
    expect(svg).toContain('viewBox="0 0 1200 900"');
    expect(svg).toContain('transform="translate(60 0)"');
    expect(svg).toContain('data-card-frame="expanded" x="18" y="18" width="1164"');
    expect(svg).toContain("Волейбол");
    expect(svg).toContain("ZŠ Zeyerova");
    expect(svg).not.toContain("&lt;вечером&gt;");
    expect(svg).toContain("ZŠ Demlova");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("park");
    expect(svg).toContain(">V</text>");
    expect(svg).toContain('data-organizer-avatar-slot="soft-square"');
    expect(svg).toContain(`x="${SPORT_SHARE_AVATAR_LEFT}" y="716"`);
    expect(svg).toContain('rx="16"');
    expect(svg).not.toContain(">Vitalii Pashyn<");
    expect(svg).not.toContain('x1="58" y1="690"');
    expect(svg).not.toContain('data-share-participants');
    expect(svg).not.toContain("2 / 12");
    expect(svg).toContain('data-share-footer="sport-content-width"');
    expect(svg).not.toContain('x1="242" y1="714"');
    expect(svg).not.toContain('x1="510" y1="714"');
    expect(svg).not.toContain('x1="750" y1="714"');
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

  it("sizes sport footer dividers from the rendered metadata content", () => {
    const compact = buildTelegramShareCardSvg({ ...card, date: "2. 9", time: "15:30", price: 0 });
    const widerDate = buildTelegramShareCardSvg({ ...card, date: "Středa 2. září", time: "15:30", price: 0 });
    const widerPrice = buildTelegramShareCardSvg({ ...card, date: "2. 9", time: "15:30", price: 1250 });

    expect(dividerValue(widerDate, "data-date-divider")).toBeGreaterThan(dividerValue(compact, "data-date-divider"));
    expect(dividerValue(widerPrice, "data-price-divider")).toBeGreaterThan(dividerValue(compact, "data-price-divider"));
    expect(dividerValue(widerPrice, "data-price-divider")).toBeGreaterThan(dividerValue(widerPrice, "data-date-divider"));
  });

  it("uses the remaining sport footer width for the address and ellipsizes overflow", () => {
    const svg = buildTelegramShareCardSvg({
      ...card,
      address: "Křížíkova 1278/1a, Olomouc, velmi dlouhý popis vstupu do sportovní haly přes zadní recepci",
    });
    expect(svg).toContain("Křížíkova");
    expect(svg).toContain("…");
  });

  it("keeps the legacy fixed footer outside Sport", () => {
    const svg = buildTelegramShareCardSvg({
      ...card,
      isSport: false,
      description: "This must not replace the legacy subtitle",
    });
    expect(svg).toContain('data-share-footer="two-row"');
    expect(svg).toContain('x1="242" y1="714"');
    expect(svg).toContain("&lt;вечером&gt;");
  });

  it("never renders weather or participant data in share cards", () => {
    const withDynamicData = {
      ...card,
      participants: 9,
      capacity: 15,
      weather: { icon: "🌧️", temperature: 19, rain: 60, wind: 6 },
    };
    for (const svg of [buildTelegramShareCardSvg(withDynamicData), buildMetaInvitationCardSvg(withDynamicData)]) {
      expect(svg).not.toContain("19°C");
      expect(svg).not.toContain("60%");
      expect(svg).not.toContain("6 km/h");
      expect(svg).not.toContain("data-weather-lines");
      expect(svg).not.toContain("data-weather-icon");
      expect(svg).not.toContain("9 / 15");
      expect(svg).not.toContain("data-share-participants");
    }
  });

  it("resolves approved category artwork as the full-card JPEG background", () => {
    expect(hasEventShareBackground(card)).toBe(true);
    expect(hasEventShareBackground({ ...card, activity: "Ролики", title: "Ролики" })).toBe(true);
    expect(hasEventShareBackground({ ...card, icon: "", activity: "Пользовательское событие", title: "Пользовательское событие" })).toBe(false);
  });

  it("bundles regular and bold Cyrillic fonts for serverless rendering", () => {
    const fonts = configureTelegramShareCardFonts();
    const fontConfig = readFileSync(fonts.configFile, "utf8");
    expect(fonts.regularFont).toMatch(/DejaVuSans\.ttf$/);
    expect(fonts.boldFont).toMatch(/DejaVuSans-Bold\.ttf$/);
    expect(existsSync(fonts.regularFont)).toBe(true);
    expect(existsSync(fonts.boldFont)).toBe(true);
    expect(existsSync(fonts.configFile)).toBe(true);
    expect(fontConfig).toContain("<family>GO IRL Beauty Script Web</family>");
    expect(fontConfig).toContain("<family>GO IRL Beauty Script</family>");
    expect(fontConfig.match(/<prefer><family>Great Vibes<\/family><\/prefer>/g)).toHaveLength(2);
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
      isSport: false,
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
    expect(svg).not.toContain("23°C");
    expect(svg).not.toContain("12%");
    expect(svg).not.toContain("19 km/h");
    expect(svg).not.toContain('data-weather-lines="three"');
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
