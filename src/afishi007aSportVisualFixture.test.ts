import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const fixture = readFileSync(resolve(process.cwd(), "src/city-posters/SportVisualFixture.tsx"), "utf8");

describe("AFISHI007A sport visual fixture", () => {
  it("shows only the static sport visual fixture from the City Posters shell", () => {
    expect(page).toContain('category === "sport"');
    expect(page).toContain("<SportVisualFixture language={language} />");
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
