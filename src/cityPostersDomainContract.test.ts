import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appEntry = readFileSync(resolve(process.cwd(), "src/app-entry.ts"), "utf8");
const cityPage = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const cityCss = readFileSync(resolve(process.cwd(), "src/city-posters/city-posters.css"), "utf8");
const launchPage = readFileSync(resolve(process.cwd(), "src/LaunchPage.tsx"), "utf8");
const servicesPortal = readFileSync(resolve(process.cwd(), "src/beauty/ServicesBottomNavigationPortal.tsx"), "utf8");

describe("City Posters Services/Beauty shell contract", () => {
  it("boots City Posters through an independent entry point", () => {
    expect(appEntry).toContain('normalizedPath === "/city-posters"');
    expect(appEntry).toContain('import("./city-posters/entry")');
    expect(appEntry).toContain('import("./main")');
  });

  it("keeps the root launch sequence Activity → City Posters → Service", () => {
    const activity = launchPage.indexOf('className="launch-domain-card launch-activities-card"');
    const cityPosters = launchPage.indexOf('className="launch-domain-card launch-city-posters-card"');
    const services = launchPage.indexOf('className="launch-domain-card launch-services-card"');
    expect(activity).toBeGreaterThan(-1);
    expect(cityPosters).toBeGreaterThan(activity);
    expect(services).toBeGreaterThan(cityPosters);
    expect(launchPage).toContain('window.location.assign("/city-posters")');
    expect(launchPage).toContain('afisa: "Афиша"');
    expect(launchPage).toContain('afisa: "Афіша"');
    expect(launchPage).toContain('afisa: "Program města"');
    expect(launchPage).toContain('afisa: "City Posters"');
    expect(launchPage).toContain('afisa: "Program miasta"');
    expect(launchPage).toContain('afisa: "Program mesta"');
  });

  it("keeps Polish and Slovak launch copy native instead of presentation fallbacks", () => {
    expect(launchPage).toContain('choose: "Od czego zaczynamy?"');
    expect(launchPage).toContain('telegram: "Otwórz w Telegramie"');
    expect(launchPage).toContain('choose: "Kde začneme?"');
    expect(launchPage).toContain('telegram: "Otvoriť v Telegrame"');
    expect(launchPage).toContain('localeByLanguage[language]');
  });

  it("keeps four City Posters categories on Services-style visual cards", () => {
    expect(cityPage).toContain('const homeCategories: CityPostersCategory[] = ["cinema", "concerts", "festivals", "sport"]');
    expect(cityPage).toContain('className="category-grid module-grid services-category-grid city-posters-category-grid"');
    expect(cityPage).toContain('className="category-button city-posters-category-card"');
    expect(cityPage).toContain('onClick={() => openCategory(item)}');
    expect(cityCss).toContain("aspect-ratio: 1;");
    expect(cityCss).toContain("border: 4px solid #c9a44c");
  });

  it("uses one Services bottom navigation without a duplicate category tab strip", () => {
    expect(cityPage).not.toContain("ProductDomainTabs");
    expect(servicesPortal).not.toContain("ProductDomainTabs");
    expect(cityPage).toContain('type CityPostersPrimaryView = "home" | "for-you" | "catalog" | "planned"');
    expect(cityPage).toContain('className="bottom-nav"');
    expect(cityPage).not.toContain("city-posters-bottom-nav");
    expect(cityPage).not.toContain("city-posters-category-tabs");
    expect(cityCss).not.toContain(".city-posters-bottom-nav");
    expect(cityCss).not.toContain(".city-posters-category-tabs");
    expect(cityPage).not.toContain("ServicesProfessional");
    expect(cityPage).not.toContain("BeautyMasterWorkspace");
  });

  it("keeps AFISHI007A disconnected from event data while retaining profile entry", () => {
    expect(cityPage).not.toContain("CinemaPostersCatalog");
    expect(cityPage).not.toContain("CityPostersEventCatalog");
    expect(cityPage).toContain("emptyCatalog");
    expect(cityPage).toContain('enterCanonicalProfile({');
  });
});
