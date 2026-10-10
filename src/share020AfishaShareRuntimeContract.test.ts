import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cityPostersFallbackArtwork } from "../api/telegram/event-share-card";

const page = readFileSync(new URL("./city-posters/CityPostersPage.tsx", import.meta.url), "utf8");
const catalog = readFileSync(new URL("./city-posters/events/CityPostersEventCatalog.tsx", import.meta.url), "utf8");
const shareCard = readFileSync(new URL("../api/telegram/event-share-card.ts", import.meta.url), "utf8");
const preparedShare = readFileSync(new URL("../api/telegram/prepared-share.ts", import.meta.url), "utf8");

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
    expect(shareCard).toContain("jpeg = await sharp(candidate)");
    expect(shareCard).toContain('if (!jpeg) return response.status(502).end("artwork_unavailable")');
    expect(shareCard).not.toContain("cityPostersFallbackArtwork[slug]");
  });

  it.each([
    ["cinema", "cinema"],
    ["concerts", "concerts"],
    ["festivals", "festivals"],
    ["sport", "sport"],
    ["theatre", "culture"],
    ["comedy", "culture"],
    ["exhibitions", "culture"],
    ["family", "events"],
    ["education", "events"],
    ["nightlife", "events"],
    ["city_special", "events"],
    ["other", "events"],
    ["unrecognized", "events"],
  ])("maps the %s vertical to its %s Telegram fallback", (vertical, category) => {
    expect(cityPostersFallbackArtwork(vertical)).toBe(
      `https://go-irl.fun/city-posters/category-backgrounds/${category}.webp`,
    );
  });

  it("versions City Posters Telegram media URLs so Telegram refetches changed artwork", () => {
    expect(preparedShare).toContain('const cityPostersShareCardRevision = "share020-v3"');
    expect(preparedShare).toContain('image.searchParams.set("v", cityPostersShareCardRevision)');
  });
});
