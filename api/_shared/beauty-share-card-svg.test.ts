import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildBeautyShareCardSvg, buildTelegramBeautyShareCardSvg } from "./beauty-share-card-svg";
import { renderBeautyShareCardJpeg, renderTelegramBeautyShareCardJpeg } from "./telegram-share-card-image";
import type { TelegramEventCardInput } from "./telegram-event-card";

const require = createRequire(import.meta.url);
process.env.GO_IRL_BEAUTY_SCRIPT_FONT_PATH = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSerif-Italic.ttf");

const card: TelegramEventCardInput = {
  eventId: "profile-1",
  title: "Маникюр с гель-лаком",
  activity: "Studio Vita",
  description: "Комбинированный маникюр, выравнивание и укрепление натуральных ногтей",
  date: "",
  eventDate: "",
  time: "",
  address: "Центр, Оломоуц",
  participants: 0,
  capacity: 0,
  icon: "✨",
  inviteUrl: "https://t.me/GOirl_bot?startapp=beauty-test",
  publicProfileUrl: "https://go-irl-1-0.vercel.app/beauty/beauty-test",
  city: "Olomouc",
  price: 890,
  level: "Бьюти-услуга",
  format: "60 min",
  environment: "Центр, Оломоуц",
  language: "ru",
  beautyServices: [
    { name: "Маникюр с гель-лаком", priceCzk: 890 },
    { name: "Педикюр и долговременное покрытие", priceCzk: 990 },
    { name: "Nail art", priceCzk: 250 },
  ],
};

describe("Beauty share card SVG", () => {
  it("renders the premium v3 1080x1020 card with a white calligraphic title", () => {
    const svg = buildBeautyShareCardSvg(card);
    expect(svg).toContain('width="1080" height="1020"');
    expect(svg.match(/data-beauty-service-row=/g)).toHaveLength(3);
    expect(svg).toContain('data-beauty-template="premium-v3"');
    expect(svg).toContain('data-beauty-double-frame="true"');
    expect(svg).toContain('data-beauty-logo-slot="true"');
    expect(svg).toContain('font-family="GO IRL Beauty Script Web, GO IRL Beauty Script, Great Vibes, cursive"');
    expect(svg).toContain('data-beauty-premium-title="true" x="80" y="150" fill="#fff"');
    expect(svg).not.toContain('data-beauty-premium-title="true" x="80" y="150" fill="url(#goldGrad)"');
    expect(svg).toContain("Studio Vita");
    expect(svg).toContain("Комбинированный маникюр");
    expect(svg).toContain("Услуги и запись");
    expect(svg).not.toContain("GO IRL BEAUTY");
    expect(svg).not.toContain("LESS SCROLLING. MORE LIFE.");
    expect(svg).not.toContain("go-irl-1-0.vercel.app/beauty/beauty-test");
    expect(svg).not.toContain('id="leftShade"');
    expect(svg).not.toContain('transform="translate(620 807) scale(1.15)"');
    expect(svg).toContain('data-beauty-default-cta="true"');
  });

  it("renders a Telegram-only 1080x900 premium card with three description lines and no fake CTA", () => {
    const svg = buildTelegramBeautyShareCardSvg({
      ...card,
      description: "Комбинированный маникюр, выравнивание и укрепление натуральных ногтей, однотонные покрытия и минималистичный дизайн",
    });
    expect(svg).toContain('width="1080" height="900"');
    expect(svg.match(/data-beauty-description-line=/g)).toHaveLength(3);
    expect(svg.match(/data-beauty-service-row=/g)).toHaveLength(3);
    expect(svg).toContain("Центр, Оломоуц");
    expect(svg).toContain('data-beauty-template="premium-v3"');
    expect(svg).toContain('data-beauty-premium-title="true" x="80" y="150" fill="#fff"');
    expect(svg).not.toContain('data-beauty-default-cta="true"');
    expect(svg).toContain('fill="url(#goldGrad)"');
    expect(svg).not.toContain('id="leftShade"');
    expect(svg).not.toContain('transform="translate(620 807) scale(1.15)"');
    expect(svg).not.toContain("Услуги и запись");
  });

  it("keeps the complete city plus area location away from Telegram's lower-right timestamp overlay", () => {
    const svg = buildTelegramBeautyShareCardSvg({ ...card, city: "Přerov", address: "Centrum" });
    expect(svg).toContain("Přerov, Centrum");
    expect(svg).toContain('data-beauty-location-text="true" x="80" y="835" text-anchor="start"');
  });

  it("produces opaque server JPEGs with channel-specific dimensions", async () => {
    const jpeg = await renderBeautyShareCardJpeg(card);
    const telegramJpeg = await renderTelegramBeautyShareCardJpeg(card);
    const metadata = await sharp(jpeg).metadata();
    const telegramMetadata = await sharp(telegramJpeg).metadata();
    const stats = await sharp(jpeg).stats();
    const telegramStats = await sharp(telegramJpeg).stats();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1020);
    expect(telegramMetadata.format).toBe("jpeg");
    expect(telegramMetadata.width).toBe(1080);
    expect(telegramMetadata.height).toBe(900);
    expect(jpeg.length).toBeLessThan(5 * 1024 * 1024);
    expect(telegramJpeg.length).toBeLessThan(5 * 1024 * 1024);
    expect(stats.isOpaque).toBe(true);
    expect(telegramStats.isOpaque).toBe(true);
  });
});
