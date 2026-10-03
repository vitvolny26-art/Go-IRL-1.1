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

  it("routes known live matches through the governed renderer", () => {
    expect(resolveCityPostersSportArtwork({
      subcategory: "rugby",
      canonical_slug: "rc-olomouc-jimi-rc-vyskov-2026-10-04",
    }, "for-you")).toBe(
      "/api/city-posters/sport-match-artwork?slug=rc-olomouc-jimi-rc-vyskov-2026-10-04&variant=for-you",
    );
  });

  it("keeps a static sport background when slug is unavailable", () => {
    expect(resolveCityPostersSportArtwork({ subcategory: "rugby" }, "catalog"))
      .toBe("/city-posters/sport-match-backgrounds/catalog-4x3/rugby.jpg");
  });

  it("keeps a hero fallback when the sport subtype is unavailable", () => {
    expect(resolveCityPostersSportArtwork({
      subcategory: null,
      hero_media_url: "https://go-irl.fun/legacy/generic-sport.jpg",
    }, "catalog")).toBe("https://go-irl.fun/legacy/generic-sport.jpg");
  });
});
