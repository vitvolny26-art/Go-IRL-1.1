import { describe, expect, it } from "vitest";
import { getServiceArtwork, manicureArtwork } from "./serviceArtwork";

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

  it("does not apply manicure artwork to another service", () => {
    expect(getServiceArtwork("Massage")).toBeNull();
  });
});
