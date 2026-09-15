import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appEntry = readFileSync(resolve(process.cwd(), "src/app-entry.ts"), "utf8");
const cityPage = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const cityCss = readFileSync(resolve(process.cwd(), "src/city-posters/city-posters.css"), "utf8");
const launchPage = readFileSync(resolve(process.cwd(), "src/LaunchPage.tsx"), "utf8");
const servicesPortal = readFileSync(resolve(process.cwd(), "src/beauty/ServicesBottomNavigationPortal.tsx"), "utf8");

describe("AFISHI006 City Posters Services-parity shell", () => {
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
    expect(launchPage).toContain('activities: "Aktywności"');
    expect(launchPage).toContain('services: "Usługi"');
    expect(launchPage).toContain('telegram: "Otwórz w Telegramie"');
    expect(launchPage).toContain('choose: "Kde začneme?"');
    expect(launchPage).toContain('activitiesInfo: "Stretávajte sa, hýbte sa a trávte čas spolu."');
    expect(launchPage).toContain('servicesInfo: "Nájdite miestnych odborníkov a užitočné služby."');
    expect(launchPage).toContain('telegram: "Otvoriť v Telegrame"');
    expect(launchPage).toContain('localeByLanguage[language]');
  });

  it("keeps four City Posters categories but uses Services-style visual cards", () => {
    expect(cityPage).toContain('const homeCategories: CityPostersCategory[] = ["cinema", "concerts", "festivals", "sport"]');
    expect(cityPage).toContain('className="city-posters-category-grid"');
    expect(cityPage).toContain('className="city-posters-category-card"');
    expect(cityPage).toContain('onClick={() => openCategory(item)}');
    expect(cityCss).toContain("aspect-ratio: 1;");
    expect(cityPage).toContain('className="category-grid module-grid services-category-grid city-posters-category-grid"');
    expect(cityPage).toContain('className="category-button city-posters-category-card"');
    expect(cityCss).toContain("border: 4px solid #c9a44c");
  });

  it("uses Services-style five-tab primary navigation without importing Services business logic", () => {
    expect(cityPage).not.toContain("ProductDomainTabs");
    expect(servicesPortal).not.toContain("ProductDomainTabs");
    expect(cityPage).toContain('type CityPostersPrimaryView = "home" | "for-you" | "catalog" | "planned"');
    expect(cityPage).toContain('className="bottom-nav city-posters-bottom-nav"');
    expect(cityPage).toContain('{ id: "home", label: t.navHome');
    expect(cityPage).toContain('{ id: "for-you", label: t.navForYou');
    expect(cityPage).toContain('{ id: "catalog", label: t.navCatalog');
    expect(cityPage).toContain('{ id: "planned", label: t.navPlanned');
    expect(cityPage).toContain('{ id: "profile", label: t.navProfile');
    expect(cityCss).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(cityPage).not.toContain("ServicesProfessional");
    expect(cityPage).not.toContain("BeautyMasterWorkspace");
  });

  it("preserves City Posters cinema For You, Catalog and Planned projections", () => {
    expect(cityPage).toContain('variant="for-you"');
    expect(cityPage).toContain('variant="catalog"');
    expect(cityPage).toContain('variant="planned"');
    expect(cityPage).toContain('enterCanonicalProfile({');
  });
});
