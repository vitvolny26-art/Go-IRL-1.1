import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const shareCard = readFileSync(resolve(process.cwd(), "api/telegram/event-share-card.ts"), "utf8");
const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

describe("AFISHI011 Cinema City 25 years offer card", () => {
  it("scopes the approved promotion to the four large Czech GO IRL cities", () => {
    expect(app).toContain("cinemaCity25OfferByCity[selectedCityId]");
    expect(app).toContain('canonicalSlug: "cinema-city-25-let-praha"');
    expect(app).toContain('canonicalSlug: "cinema-city-25-let-brno"');
    expect(app).toContain('canonicalSlug: "cinema-city-25-let-ostrava"');
    expect(app).toContain('canonicalSlug: "cinema-city-25-let-olomouc"');
    expect(app).toContain("isCityPostersPromotionActive(cinemaCity25Event, nowMs)");
    expect(app).toContain("loadCityPostersEventBySlug(slug, language)");
  });

  it("keeps the approved Cinema City facts and official details link", () => {
    expect(app).toContain("Cinema City 25 лет");
    expect(app).toContain("Cinema City slaví 25 let");
    expect(app).toContain("Билеты на кассе — 125 Kč");
    expect(app).toContain("Vstupenky na pokladně za 125 Kč");
    expect(app).toContain("https://www.cinemacity.cz/static/cs/cz/offers/25let");
    expect(app).toContain("<span>125 Kč</span>");
    expect(app).toContain("<span>{cinemaCity25Copy.date}</span>");
  });

  it("uses generated Czech offer artwork and official afishi artwork assets", () => {
    expect(app).toContain('src="/offers/cinema-city-25-let.webp"');
    expect(viteConfig).toContain('publicDir: "images"');
    expect(shareCard).toContain('"cinema-city-25-let-praha": "https://go-irl.fun/offers/cinema-city-25-let.webp"');
    expect(shareCard).toContain('"cinema-city-25-let-olomouc": "https://go-irl.fun/offers/cinema-city-25-let.webp"');
  });

  it("reuses City Posters planning and prepared Telegram sharing", () => {
    expect(app).toContain("planCityPostersEventBySlug(selectedCityId, cinemaCity25Offer?.canonicalSlug || \"\")");
    expect(app).toContain("sharePreparedTelegramCityPostersEvent(cinemaCity25Offer?.canonicalSlug || \"\", language)");
    expect(app).toContain('data-offer-id="cinema-city-25-let"');
    expect(app).toContain('className="offer-promo-share-action"');
  });

  it("provides native copy for all six supported UI languages", () => {
    expect(app).toContain('ru: { title: "Cinema City 25 лет"');
    expect(app).toContain('uk: { title: "Cinema City 25 років"');
    expect(app).toContain('cs: { title: "Cinema City slaví 25 let"');
    expect(app).toContain('en: { title: "Cinema City turns 25"');
    expect(app).toContain('pl: { title: "Cinema City ma 25 lat"');
    expect(app).toContain('sk: { title: "Cinema City oslavuje 25 rokov"');
  });
});
