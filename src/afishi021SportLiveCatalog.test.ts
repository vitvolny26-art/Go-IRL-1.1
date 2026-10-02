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

  it("keeps artwork visible when a live sport event has no hero image", () => {
    expect(catalog).toContain('/activities/sheets-9x16/02-football.webp');
    expect(catalog).toContain('const sportArtwork = row.hero_media_url || "/activities/sheets-9x16/02-football.webp"');
    expect(catalog).toContain('const cardArtwork = category === "sport" ? sportArtwork : eventArtwork;');
  });
});
