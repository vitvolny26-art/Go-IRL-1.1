import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appEntry = source("./app-entry.ts");
const launchPage = source("./LaunchPage.tsx");
const cityEntry = source("./city-posters/entry.tsx");
const cityPage = source("./city-posters/CityPostersPage.tsx");
const servicesPortal = source("./beauty/ServicesBottomNavigationPortal.tsx");
const guestAccess = source("./guestAppAccess.ts");

describe("AFISHI002 City Posters domain shell", () => {
  it("boots City Posters independently from the Activity/Service main app", () => {
    expect(index).toContain('/src/app-entry.ts');
    expect(index).not.toContain('/src/main.tsx');
    expect(appEntry).toContain('normalizedPath === "/city-posters"');
    expect(appEntry).toContain('import("./city-posters/entry")');
    expect(appEntry).toContain('import("./main")');
    expect(cityEntry).not.toContain('import("../main")');
    expect(cityEntry).not.toContain("ServicesExperiencePortals");
    expect(cityPage).not.toContain("ServiceActivityCard");
  });

  it("preserves the existing launch cards and adds Afisa as the third square entry", () => {
    const activity = launchPage.indexOf("launch-activities-card");
    const services = launchPage.indexOf("launch-services-card");
    const afisa = launchPage.indexOf("launch-city-posters-card");
    expect(activity).toBeGreaterThan(-1);
    expect(services).toBeGreaterThan(activity);
    expect(afisa).toBeGreaterThan(services);
    expect(launchPage).toContain('window.location.assign("/city-posters")');
    expect(launchPage).toContain("cityPostersCardImage");
    expect(launchPage).toContain('afisa: "Afisa"');
  });

  it("uses the Activity visual navigation pattern with independent Afisa view state", () => {
    expect(cityPage).not.toContain("ProductDomainTabs");
    expect(servicesPortal).not.toContain("ProductDomainTabs");
    expect(cityPage).toContain('type CityPostersView = "home" | "for-you" | "catalog" | "planned" | "profile"');
    expect(cityPage).toContain('className="bottom-nav city-posters-bottom-nav"');
    expect(cityPage).toContain('navHome: "Главная"');
    expect(cityPage).toContain('navForYou: "Для вас"');
    expect(cityPage).toContain('navCatalog: "Каталог"');
    expect(cityPage).toContain('navPlanned: "Запланировано"');
    expect(cityPage).toContain('navProfile: "Мой профиль"');
    expect(cityPage).not.toContain('useAppStore((state) => state.view)');
    expect(cityPage).not.toContain('useAppStore((state) => state.setView)');
  });

  it("exposes City Posters as a public guest catalog route", () => {
    expect(guestAccess).toContain('"/city-posters"');
  });
});
