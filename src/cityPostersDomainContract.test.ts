import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appEntry = source("./app-entry.ts");
const cityEntry = source("./city-posters/entry.tsx");
const cityPage = source("./city-posters/CityPostersPage.tsx");
const domainTabs = source("./components/ProductDomainTabs.tsx");
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

  it("keeps exactly three peer domain tabs in the requested order", () => {
    const service = domainTabs.indexOf("Service");
    const posters = domainTabs.indexOf("City Posters");
    const activity = domainTabs.indexOf("Activity");
    expect(service).toBeGreaterThan(-1);
    expect(posters).toBeGreaterThan(service);
    expect(activity).toBeGreaterThan(posters);
    expect(domainTabs).toContain('"/city-posters"');
    expect(servicesPortal).toContain("<ProductDomainTabs");
  });

  it("exposes City Posters as a public guest catalog route", () => {
    expect(guestAccess).toContain('"/city-posters"');
  });
});
