import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const launchPage = readFileSync(resolve(process.cwd(), "src/LaunchPage.tsx"), "utf8");
const launchCss = readFileSync(resolve(process.cwd(), "src/launch-page.css"), "utf8");

describe("Launch offers placeholder card", () => {
  it("fills the fourth launch slot after Services without exposing an unfinished route", () => {
    const services = launchPage.indexOf('className="launch-domain-card launch-services-card"');
    const offers = launchPage.indexOf('className="launch-domain-card launch-offers-card"');
    const offersEnd = launchPage.indexOf("</button>", offers);
    const offersMarkup = launchPage.slice(offers, offersEnd);

    expect(services).toBeGreaterThan(-1);
    expect(offers).toBeGreaterThan(services);
    expect(offersMarkup).toContain("disabled");
    expect(offersMarkup).not.toContain("onClick");
    expect(launchPage).not.toContain('window.location.assign("/offers")');
  });

  it("localizes the title and development state for all six supported languages", () => {
    expect(launchPage).toContain('offers: "Акции и бонусы"');
    expect(launchPage).toContain('offers: "Акції та бонуси"');
    expect(launchPage).toContain('offers: "Akce a bonusy"');
    expect(launchPage).toContain('offers: "Deals & bonuses"');
    expect(launchPage).toContain('offers: "Promocje i bonusy"');
    expect(launchPage).toContain('offers: "Akcie a bonusy"');
    expect(launchPage).toContain('inDevelopment: "В разработке"');
    expect(launchPage).toContain('inDevelopment: "У розробці"');
    expect(launchPage).toContain('inDevelopment: "Ve vývoji"');
    expect(launchPage).toContain('inDevelopment: "In development"');
    expect(launchPage).toContain('inDevelopment: "W przygotowaniu"');
    expect(launchPage).toContain('inDevelopment: "Vo vývoji"');
  });

  it("keeps the placeholder visually distinct without looking disabled by browser defaults", () => {
    expect(launchCss).toContain(".launch-offers-card{");
    expect(launchCss).toContain(".launch-offers-card:disabled{opacity:1");
    expect(launchCss).toContain(".launch-development-badge{");
    expect(launchCss).toContain("#ff5fa2");
  });
});
