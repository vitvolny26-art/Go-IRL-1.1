import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const catalogStyles = readFileSync(resolve(process.cwd(), "src/event-catalog-share-card.css"), "utf8");

describe("AFISHI007 Noc vědy offers placement", () => {
  it("loads the exact published Noc vědy event into /offers for all four approved cities", () => {
    expect(app).toContain('const nocVedyOfferCities = new Set(["praha", "brno", "ostrava", "olomouc"])');
    expect(app).toContain('window.location.pathname.replace(/\\/+$/, "") === "/offers"');
    expect(app).toContain('loadCityPostersEventBySlug(nocVedySlug, language)');
    expect(app).toContain('data-offer-id="noc-vedy-2026"');
    expect(app).toContain('src="/afishi/noc-vedy-2026.webp"');
  });

  it("matches the Activity Catalog square-card geometry without cropping campaign artwork", () => {
    const cardStyles = styles.match(/\.offer-promo-card\s*\{([\s\S]*?)\}/)?.[1] || "";
    const artworkStyles = styles.match(/\.offer-promo-campaign-artwork\s*\{([\s\S]*?)\}/)?.[1] || "";

    expect(app).toContain('className="offers-promo-grid"');
    expect(catalogStyles).toContain("aspect-ratio:1/1!important;");
    expect(cardStyles).toContain("width: 100%;");
    expect(cardStyles).toContain("aspect-ratio: 1 / 1;");
    expect(cardStyles).toContain("min-height: 0;");
    expect(cardStyles).not.toContain("max-width: 560px;");
    expect(artworkStyles).toContain("object-fit:contain;");
    expect(artworkStyles).toContain("object-position:center top;");
    expect(artworkStyles).not.toContain("object-fit:cover;");
    expect(styles).toContain(".offers-promo-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }");
    expect(styles).toContain("grid-template-columns:repeat(3,minmax(0,1fr));");
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
