import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "src/city-posters/city-posters.css"), "utf8");

describe("AFISHI018 category visual polish", () => {
  it("uses uniform Cinema framing and smaller event-count copy", () => {
    expect(css).toContain('city-posters-category-card[data-category="cinema"]');
    expect(css).toContain("border: 1px solid #c9a44c;");
    expect(css).not.toContain("border: 4px solid #c9a44c;");
    expect(css).toContain(".city-posters-category-card small");
    expect(css).toContain("font-size: 11px;");
    expect(page).toContain('<small>{item === "cinema" ? cinemaCountLabel(categoryCounts[item] ?? 0) : t.eventCount(categoryCounts[item] ?? 0)}</small>');
    expect(page).toContain("const movieIds = new Set(screenings.filter((row) => {");
    expect(page).toContain("return [category, movieIds.size] as const;");
  });

  it("ships dedicated Culture and Events artwork", () => {
    expect(existsSync(resolve(process.cwd(), "images/city-posters/category-backgrounds/culture.webp"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "images/city-posters/category-backgrounds/events.webp"))).toBe(true);
    expect(css).toContain('url("/city-posters/category-backgrounds/culture.webp")');
    expect(css).toContain('url("/city-posters/category-backgrounds/events.webp")');
  });
});
