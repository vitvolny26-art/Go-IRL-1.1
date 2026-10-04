import { describe, expect, it } from "vitest";
import {
  normalizeCityPostersSportSubcategory,
  resolveCityPostersSportArtwork,
  resolveCityPostersSportBrowserFallback,
  resolveCityPostersSportFallbackArtwork,
} from "./city-posters/events/cityPostersSportArtwork";

describe("AFISHI021B sport artwork UI resolver", () => {
  it.each([
    ["football", "football"],
    ["ice hockey", "ice_hockey"],
    ["basketball", "basketball"],
    ["volleyball", "volleyball"],
    ["rugby", "rugby"],
  ] as const)("normalizes %s", (input, expected) => {
    expect(normalizeCityPostersSportSubcategory(input)).toBe(expected);
  });

  it("routes known live matches through the governed renderer with the AFISHI021B cache revision", () => {
    expect(resolveCityPostersSportArtwork({
      subcategory: "rugby",
      canonical_slug: "rc-olomouc-jimi-rc-vyskov-2026-10-04",
    }, "for-you")).toBe(
      "https://go-irl-1-1.vercel.app/api/telegram/event-share-card?slug=rc-olomouc-jimi-rc-vyskov-2026-10-04&variant=for-you&mode=city-posters-sport&v=afishi021b-4",
    );
  });

  it("exposes official-club browser fallbacks when the cross-origin renderer cannot load", () => {
    expect(resolveCityPostersSportBrowserFallback({
      subcategory: "rugby",
      title: "RC Olomouc – JIMI RC Vyškov",
    })).toEqual({
      home: {
        logoUrl: "https://www.rugbyolomouc.cz/files/uploads/fanzone/Logo/Logo%20RUGBY%20CLUB%20Olomouc.png",
        initials: "O",
      },
      away: {
        logoUrl: "https://4759cbf9b9.clvaw-cdnwnd.com/7d24613558f1bc3463afffcad225df1f/200000023-d8960d8963/nove-logo.png?ph=4759cbf9b9",
        initials: "V",
      },
    });
  });

  it("keeps a static sport background when slug is unavailable", () => {
    expect(resolveCityPostersSportArtwork({ subcategory: "rugby" }, "catalog"))
      .toBe("/city-posters/sport-match-backgrounds/catalog-4x3/rugby.jpg");
  });

  it("exposes the same deterministic local background as the browser error fallback", () => {
    expect(resolveCityPostersSportFallbackArtwork({ subcategory: "basketball" }, "for-you"))
      .toBe("/city-posters/sport-match-backgrounds/for-you-9x16/basketball.jpg");
  });

  it("keeps a hero fallback when the sport subtype is unavailable", () => {
    expect(resolveCityPostersSportArtwork({
      subcategory: null,
      hero_media_url: "https://go-irl.fun/legacy/generic-sport.jpg",
    }, "catalog")).toBe("https://go-irl.fun/legacy/generic-sport.jpg");
  });
});
