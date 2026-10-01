import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./city-posters/CityPostersPage.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("./city-posters/events/CityPostersEventCatalog.tsx", import.meta.url), "utf8");
const shareCard = readFileSync(new URL("../api/telegram/event-share-card.ts", import.meta.url), "utf8");

describe("SHARE020 shared Afisha event focus", () => {
  it("opens Telegram event links in category For You instead of fullscreen detail", () => {
    expect(page).toContain('get("event")');
    expect(page).toContain('get("detail")');
    expect(page).toContain('setCategoryView("for-you")');
    expect(page).toContain("categoryForVertical(row.vertical)");
    expect(catalog).toContain('const detailsHref = `/city-posters?detail=${encodeURIComponent(row.canonical_slug)}`');
    expect(catalog).toContain("data-city-posters-slug={row.canonical_slug}");
  });

  it("falls back to shared category artwork for every Afisha vertical", () => {
    expect(shareCard).toContain("const cityPostersFallbackArtwork = (vertical: string)");
    expect(shareCard).toContain("const artworkUrls = [card.heroMediaUrl, fallbackArtworkUrl]");
    expect(shareCard).toContain('if (!source) return response.status(502).end("artwork_unavailable")');
    expect(shareCard).not.toContain("cityPostersFallbackArtwork[slug]");
  });
});
