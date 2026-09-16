import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const fixture = readFileSync(resolve(process.cwd(), "src/city-posters/SportVisualFixture.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/city-posters/sport-visual-fixture.css"), "utf8");

describe("AFISHI007A sport visual fixture", () => {
  it("uses distinct For You and Catalog sport-card variants", () => {
    expect(page).toContain('<SportVisualFixture language={language} variant="for-you" />');
    expect(page).toContain('<SportVisualFixture language={language} variant="catalog" />');
    expect(fixture).toContain('type SportFixtureVariant = "for-you" | "catalog"');
    expect(css).toContain(".city-posters-sport-fixture--for-you");
    expect(css).toContain("min-height: clamp(440px, 112vw, 500px)");
    expect(css).toContain(".city-posters-sport-fixture--catalog");
    expect(css).toContain("aspect-ratio: 1 / 1");
  });

  it("keeps the same static football fixture in both variants", () => {
    expect(fixture).toContain("Оломоуц — Прага");
    expect(fixture).toContain("Футбол");
  });

  it("does not connect the fixture to production catalogs", () => {
    expect(page).not.toContain("CityPostersEventCatalog");
    expect(page).not.toContain("CinemaPostersCatalog");
    expect(fixture).not.toContain("supabase");
    expect(fixture).not.toContain("city_posters_event_catalog");
    expect(fixture).not.toContain("city_posters_cinema_catalog");
  });

  it("does not invent date, time or venue details", () => {
    expect(fixture).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    expect(fixture).not.toContain("stadium");
    expect(fixture).not.toContain("Стадион");
  });
});
