import { describe, expect, it } from "vitest";
import {
  normalizeCityPostersSportSubcategory,
  resolveCityPostersSportArtwork,
} from "./city-posters/events/cityPostersSportArtwork";

describe("AFISHI021A sport artwork UI resolver", () => {
  it.each([
    ["football", "football"],
    ["ice hockey", "ice_hockey"],
    ["basketball", "basketball"],
    ["volleyball", "volleyball"],
    ["rugby", "rugby"],
  ] as const)("normalizes %s", (input, expected) => {
    expect(normalizeCityPostersSportSubcategory(input)).toBe(expected);
  });

  it("uses separate For You and Catalog backgrounds", () => {
    expect(resolveCityPostersSportArtwork({ subcategory: "rugby" }, "for-you"))
      .toBe("/city-posters/sport-match-backgrounds/for-you-9x16/rugby.jpg");
    expect(resolveCityPostersSportArtwork({ subcategory: "rugby" }, "catalog"))
      .toBe("/city-posters/sport-match-backgrounds/catalog-4x3/rugby.jpg");
  });

  it("keeps rendered hero artwork authoritative", () => {
    expect(resolveCityPostersSportArtwork({
      subcategory: "rugby",
      hero_media_url: "https://go-irl.fun/generated/rugby-match.jpg",
    }, "for-you")).toBe("https://go-irl.fun/generated/rugby-match.jpg");
  });

  it("fails neutral for an unknown sport instead of pretending it is football", () => {
    expect(resolveCityPostersSportArtwork({ subcategory: null }, "for-you"))
      .toBe("/city-posters/category-backgrounds/sport.webp");
    expect(resolveCityPostersSportArtwork({ subcategory: "unknown" }, "catalog"))
      .toBe("/city-posters/category-backgrounds/sport.webp");
  });
});
