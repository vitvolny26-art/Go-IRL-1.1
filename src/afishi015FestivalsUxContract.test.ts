import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const catalog = readFileSync(resolve(process.cwd(), "src/city-posters/events/CityPostersEventCatalog.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/city-posters/city-posters.css"), "utf8");

describe("AFISHI015 Festivals UX parity", () => {
  it("removes the generic event feed from City Posters home", () => {
    const homeSection = page.slice(page.indexOf("city-posters-home"), page.indexOf("const navItems"));
    expect(homeSection).toContain("{renderCategoryCards()}");
    expect(homeSection).not.toContain('category="all"');
  });

  it("reuses Activity For You and Catalog container patterns for Festivals", () => {
    expect(catalog).toContain('"horizontal-events city-posters-event-list city-posters-event-list--for-you"');
    expect(catalog).toContain('"activity-stack city-posters-event-list city-posters-event-list--catalog"');
    expect(styles).toContain("flex:0 0 min(92vw,420px)");
  });

  it("uses festival artwork for For You and preserves event hero in Catalog", () => {
    expect(catalog).toContain('src="/city-posters/category-backgrounds/festivals.webp"');
    expect(catalog).toContain("row.hero_media_url");
  });

  it("keeps details and planning on the City Posters event flow", () => {
    expect(catalog).toContain('const detailsHref = `/city-posters?event=${encodeURIComponent(row.canonical_slug)}`');
    expect(catalog).toContain("planCityPostersEventBySlug");
    expect(catalog).toContain('eventSlug ? "detail" : variant');
  });
});
