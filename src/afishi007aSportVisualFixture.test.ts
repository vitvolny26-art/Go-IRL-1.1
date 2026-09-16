import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const entry = readFileSync(resolve(process.cwd(), "src/city-posters/entry.tsx"), "utf8");
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

  it("keeps fixture-critical presentation in the runtime component as a CSS-load fallback", () => {
    expect(fixture).toContain('minHeight: "clamp(440px, 112vw, 500px)"');
    expect(fixture).toContain('aspectRatio: "1 / 1"');
    expect(fixture).toContain('backgroundImage: \'linear-gradient(');
    expect(fixture).toContain('url("/activities/category-backgrounds/sport.webp")');
    expect(fixture).toContain("style={articleStyle}");
    expect(fixture).toContain("style={mediaStyle}");
    expect(fixture).toContain("style={contentStyle}");
    expect(fixture).toContain("style={titleStyle}");
  });

  it("loads fixture styling from the City Posters entry after shared responsive shell CSS", () => {
    expect(fixture).not.toContain('import "./sport-visual-fixture.css"');
    expect(entry).toContain('import "../responsive-shell.css";\nimport "./sport-visual-fixture.css";');
  });

  it("reuses the existing admin runtime build badge on the independent City Posters entry", () => {
    expect(entry).toContain('import { DevPanel, shouldShowAdminDevPanel } from "../components/DevPanel"');
    expect(entry).toContain("initializeTrustedAuth");
    expect(entry).toContain("getCurrentUserRole");
    expect(entry).toContain("shouldShowAdminDevPanel(userRole) ? <DevPanel /> : null");
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
