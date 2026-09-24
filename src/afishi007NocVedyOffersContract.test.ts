import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("AFISHI007 Noc vědy offers placement", () => {
  it("loads the exact published Noc vědy event into /offers for all four approved cities", () => {
    expect(app).toContain('const nocVedyOfferCities = new Set(["praha", "brno", "ostrava", "olomouc"])');
    expect(app).toContain('window.location.pathname.replace(/\\/+$/, "") === "/offers"');
    expect(app).toContain('loadCityPostersEventBySlug(nocVedySlug, language)');
    expect(app).toContain('data-offer-id="noc-vedy-2026"');
    expect(app).toContain('src={nocVedyOffer.hero_media_url || "/noc-vedy-2026.webp"}');
  });

  it("keeps GO IRL planning, sharing and exact City Posters details actions", () => {
    expect(app).toContain("planCityPostersEventBySlug(selectedCityId, nocVedyOffer.canonical_slug)");
    expect(app).toContain("sharePreparedTelegramCityPostersEvent(nocVedyOffer.canonical_slug, language)");
    expect(app).toContain('url.searchParams.set("event", nocVedyOffer.canonical_slug)');
    expect(app).toContain('ru: { cta: "Подробнее", share: "Поделиться", wantToGo: "Хочу пойти", free: "Вход бесплатно" }');
  });
});
