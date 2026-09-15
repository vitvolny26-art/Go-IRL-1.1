import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appEntry = readFileSync(resolve(process.cwd(), "src/app-entry.ts"), "utf8");
const cityPage = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const cityCss = readFileSync(resolve(process.cwd(), "src/city-posters/city-posters.css"), "utf8");
const launchPage = readFileSync(resolve(process.cwd(), "src/LaunchPage.tsx"), "utf8");
const servicesPortal = readFileSync(resolve(process.cwd(), "src/beauty/ServicesBottomNavigationPortal.tsx"), "utf8");

describe("AFISHI002 City Posters domain shell", () => {
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

  it("uses exactly four square category shortcuts on the City Posters Home view", () => {
    expect(cityPage).toContain('const homeCategories: CityPostersCategory[] = ["cinema", "concerts", "festivals", "sport"]');
    expect(cityPage).toContain('className="city-posters-category-grid"');
    expect(cityPage).toContain('className="city-posters-category-card"');
    expect(cityPage).toContain('setCategoryView("catalog"); setSection(item);');
    expect(cityCss).toContain("aspect-ratio: 1");
  });

  it("uses four primary sections with category-level For You and Catalog tabs", () => {
    expect(cityPage).not.toContain("ProductDomainTabs");
    expect(servicesPortal).not.toContain("ProductDomainTabs");
    expect(cityPage).toContain('type CityPostersSection = "home" | "cinema" | "concerts" | "sport" | "festivals"');
    expect(cityPage).toContain('type CityPostersCategoryView = "for-you" | "catalog" | "planned"');
    expect(cityPage).toContain('className="bottom-nav city-posters-bottom-nav"');
    expect(cityPage).toContain('{ id: "home", label: t.navHome');
    expect(cityPage).toContain('{ id: "concerts", label: t.concerts');
    expect(cityPage).toContain('{ id: "sport", label: t.sport');
    expect(cityPage).toContain('{ id: "festivals", label: t.festivals');
    expect(cityPage).toContain('onClick={() => setCategoryView("for-you")}');
    expect(cityPage).toContain('onClick={() => setCategoryView("catalog")}');
    expect(cityPage).toContain('isCinema ? (');
    expect(cityPage).toContain('variant="planned"');
    expect(cityCss).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
  });
});
