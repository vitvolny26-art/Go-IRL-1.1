import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { barberArtwork, getServiceArtwork, manicureArtwork, resolveServiceArtwork } from "./serviceArtwork";

const sourceAssetPath = (assetUrl: string) => resolve(process.cwd(), "images", assetUrl.replace(/^\//, ""));
const legacyAssetPath = (assetUrl: string) => resolve(process.cwd(), "public", assetUrl.replace(/^\//, ""));

describe("service artwork", () => {
  it.each([
    "Gel manicure",
    "Маникюр",
    "Манікюр",
    "Manikúra",
    "Укрепление натуральных ногтей",
    "Минималистичный дизайн",
    "Strengthening natural nails",
    "Minimalistický design",
  ])("maps %s to manicure assets", (name) => {
    expect(getServiceArtwork(name)).toEqual(manicureArtwork);
  });

  it.each([
    "Barber",
    "Barbershop",
    "Men's haircut",
    "Haircut",
    "Стрижка",
    "Střih",
    "Skin fade",
    "Beard trim",
    "Мужская стрижка",
    "Барбер",
    "Стрижка бороды",
    "Чоловіча стрижка",
    "Pánský střih",
  ])("maps %s to barber assets", (name) => {
    expect(getServiceArtwork(name)).toEqual(barberArtwork);
  });

  it("keeps Nails and Barbering artwork under the configured Vite publicDir", () => {
    const assets = new Set([...Object.values(manicureArtwork), ...Object.values(barberArtwork)]);
    for (const asset of assets) expect(existsSync(sourceAssetPath(asset)), asset).toBe(true);
  });

  it("does not keep Barbering artwork in the legacy public/services tree", () => {
    for (const asset of new Set(Object.values(barberArtwork))) {
      expect(existsSync(legacyAssetPath(asset)), asset).toBe(false);
    }
  });

  it("uses explicit profession before any legacy service-name inference", () => {
    expect(resolveServiceArtwork("barber", "Gel manicure")).toEqual(barberArtwork);
    expect(resolveServiceArtwork("nails", "Стрижка")).toEqual(manicureArtwork);
  });

  it("keeps a legacy fallback for directory rows that do not yet expose service_specialization", () => {
    expect(resolveServiceArtwork("", "Стрижка")).toEqual(barberArtwork);
  });

  it("does not apply service artwork to another service", () => {
    expect(getServiceArtwork("Massage")).toBeNull();
  });
});
