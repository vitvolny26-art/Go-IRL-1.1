import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const catalog = readFileSync(resolve(process.cwd(), "src/city-posters/events/CityPostersEventCatalog.tsx"), "utf8");

describe("AFISHI021 live Sport presentation", () => {
  it("uses the production event catalog for Sport For You", () => {
    expect(page).not.toContain('<SportVisualFixture language={language} variant="for-you" />');
    expect(page).toContain('category === "sport" || category === "festivals"');
    expect(page).toContain('variant="for-you"');
  });

  it("keeps Cinema-style variant separation for Sport", () => {
    expect(catalog).toContain('const featuredSport = category === "sport" && cardVariant === "for-you"');
    expect(catalog).toContain('const featuredEventCard = featuredCategory || featuredSport');
    expect(catalog).toContain('city-posters-event-card--${cardVariant}');
  });

  it("uses AFISHI021A sport-specific artwork when a live event has no rendered hero image", () => {
    expect(catalog).toContain('import { resolveCityPostersSportArtwork } from "./cityPostersSportArtwork";');
    expect(catalog).toContain("const sportArtwork = resolveCityPostersSportArtwork(");
    expect(catalog).toContain('cardVariant === "for-you" ? "for-you" : "catalog"');
    expect(catalog).not.toContain('/activities/sheets-9x16/02-football.webp');
  });
});
