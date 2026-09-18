import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("AFISHI010 CineStar Kino Days offer card", () => {
  it("scopes the promotion to the Olomouc /offers surface and expires after the event weekend", () => {
    expect(app).toContain('window.location.pathname.replace(/\\/+$/, "") === "/offers"');
    expect(app).toContain('selectedCityId === "olomouc"');
    expect(app).toContain('2026-09-21T00:00:00+02:00');
    expect(app.indexOf('className="offer-promo-card"')).toBeLessThan(app.indexOf("<DiscoverSection title={t.byInterestsSection}"));
  });

  it("keeps the official CineStar facts and exact Olomouc source link", () => {
    expect(app).toContain('https://cinestar.cz/cz/olomouc/akce/kino-dny-v-cinestar');
    expect(app).toContain("<strong>100 Kč</strong>");
    expect(app).toContain("<span>19–20.09</span>");
    expect(app).toContain("CineStar Olomouc");
    expect(app).toContain("speciální program a slevy na občerstvení");
  });

  it("provides native copy for all six supported UI languages", () => {
    expect(app).toContain('ru: { title: "Дни кино в CineStar"');
    expect(app).toContain('uk: { title: "Дні кіно в CineStar"');
    expect(app).toContain('cs: { title: "Kino dny v CineStar"');
    expect(app).toContain('en: { title: "Cinema Days at CineStar"');
    expect(app).toContain('pl: { title: "Dni kina w CineStar"');
    expect(app).toContain('sk: { title: "Kino dni v CineStar"');
  });

  it("uses the GO IRL magenta offer treatment without embedding a third-party image asset", () => {
    expect(styles).toContain(".offer-promo-card {");
    expect(styles).toContain("#ff5fa2");
    expect(app).not.toContain("cinestar.cz/cz/olomouc/akce/kino-dny-v-cinestar.jpg");
  });
});
