import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
describe("AFISHI018 live category counts", () => {
  it("loads upcoming rows for every home category and renders their lengths", () => {
    expect(page).toContain("loadCityPostersEvents");
    expect(page).toContain("Promise.all(homeCategories.map");
    expect(page).toContain('timeFilter: "upcoming"');
    expect(page).toContain("rows.length");
    expect(page).toContain("categoryCounts[item] ?? 0");
    expect(page).not.toContain("<small>{t.zeroEvents}</small>");
  });
});
