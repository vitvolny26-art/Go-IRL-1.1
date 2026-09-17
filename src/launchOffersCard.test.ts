import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const launchPage = readFileSync(resolve(process.cwd(), "src/LaunchPage.tsx"), "utf8");
const launchCss = readFileSync(resolve(process.cwd(), "src/launch-page.css"), "utf8");
const launchSurface = readFileSync(resolve(process.cwd(), "src/launchSurface.ts"), "utf8");
const guestAppAccess = readFileSync(resolve(process.cwd(), "src/guestAppAccess.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("Launch offers For You entry", () => {
  it("fills the fourth launch slot after Services and opens the offers route", () => {
    const services = launchPage.indexOf('className="launch-domain-card launch-services-card"');
    const offers = launchPage.indexOf('className="launch-domain-card launch-offers-card"');
    const offersEnd = launchPage.indexOf("</button>", offers);
    const offersMarkup = launchPage.slice(offers, offersEnd);

    expect(services).toBeGreaterThan(-1);
    expect(offers).toBeGreaterThan(services);
    expect(offersMarkup).not.toContain("disabled");
    expect(offersMarkup).toContain('window.location.assign("/offers")');
    expect(offersMarkup).not.toContain("launch-development-badge");
  });

  it("keeps the offers title localized for all six supported languages", () => {
    expect(launchPage).toContain('offers: "Акции и бонусы"');
    expect(launchPage).toContain('offers: "Акції та бонуси"');
    expect(launchPage).toContain('offers: "Akce a bonusy"');
    expect(launchPage).toContain('offers: "Deals & bonuses"');
    expect(launchPage).toContain('offers: "Promocje i bonusy"');
    expect(launchPage).toContain('offers: "Akcie a bonusy"');
  });

  it("routes /offers into the existing Activities For You view", () => {
    expect(guestAppAccess).toContain('"/offers"');
    expect(launchSurface).toContain('normalizedPath === "/offers"');
    expect(launchSurface).toContain('useAppStore.setState({ view: "discover" })');
    expect(app).toContain('store.view === "discover" && (isServicesDomain');
    expect(app).toContain(': <DiscoverView language={store.language}');
  });

  it("keeps the magenta offers visual while the card is active", () => {
    expect(launchCss).toContain(".launch-offers-card{");
    expect(launchCss).toContain("#ff5fa2");
  });
});
