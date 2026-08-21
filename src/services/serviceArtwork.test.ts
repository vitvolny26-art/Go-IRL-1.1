import { describe, expect, it } from "vitest";
import { barberArtwork, getServiceArtwork, manicureArtwork } from "./serviceArtwork";

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

  it("does not apply service artwork to another service", () => {
    expect(getServiceArtwork("Massage")).toBeNull();
  });
});
