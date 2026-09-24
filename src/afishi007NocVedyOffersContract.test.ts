import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("AFISHI007 Noc vědy offers placement", () => {
  it("loads the exact published Noc vědy event into /offers for all four approved cities", () => {
    expect(app).toContain('const nocVedyOfferCities = new Set(["praha", "brno", "ostrava", "olomouc"])');
    expect(app).toContain('window.location.pathname.replace(/\\/+$/, "") === "/offers"');
    expect(app).toContain('loadCityPostersEventBySlug(nocVedySlug, language)');
    expect(app).toContain('data-offer-id="noc-vedy-2026"');
    expect(app).toContain('src="/afishi/noc-vedy-2026.webp"');
  });

  it("keeps the shared /offers artwork contract at 4:5 without cropping", () => {
    const cardStyles = styles.match(/\.offer-promo-card\s*\{([\s\S]*?)\}/)?.[1] || "";
    const artworkStyles = styles.match(/\.offer-promo-campaign-artwork\s*\{([\s\S]*?)\}/)?.[1] || "";

    expect(cardStyles).toContain("width: 100%;");
    expect(cardStyles).toContain("max-width: 560px;");
    expect(cardStyles).toContain("aspect-ratio: 4 / 5;");
    expect(cardStyles).toContain("min-height: 360px;");
    expect(cardStyles).toContain("max-height: 700px;");
    expect(artworkStyles).toContain("object-fit:contain;");
    expect(artworkStyles).not.toContain("object-fit:cover;");
    expect(styles).not.toContain(".offer-promo-card { min-height:400px;");
  });

  it("keeps GO IRL planning, sharing and exact City Posters details actions", () => {
    expect(app).toContain("planCityPostersEventBySlug(selectedCityId, nocVedyOffer.canonical_slug)");
    expect(app).toContain("sharePreparedTelegramCityPostersEvent(nocVedyOffer.canonical_slug, language)");
    expect(app).toContain('webApp.openLink(nocVedyOffer.occurrence_url, { try_instant_view: false })');
    expect(app).toContain('window.open(nocVedyOffer.occurrence_url, "_blank", "noopener,noreferrer")');
    expect(app).not.toContain('url.searchParams.set("event", nocVedyOffer.canonical_slug)');
    expect(app).toContain('ru: { cta: "Подробнее", share: "Поделиться", wantToGo: "Хочу пойти", free: "Вход бесплатно" }');
  });
});
