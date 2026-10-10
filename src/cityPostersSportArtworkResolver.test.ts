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
      "https://go-irl-1-1.vercel.app/api/telegram/event-share-card?slug=rc-olomouc-jimi-rc-vyskov-2026-10-04&variant=for-you&mode=city-posters-sport&v=share020-sport-v1",
    );
  });

  it.each([
    [
      "rugby",
      "RC Olomouc – JIMI RC Vyškov",
      "/city-posters/sports/rugby/team-emblems/rc-olomouc.png",
      "https://4759cbf9b9.clvaw-cdnwnd.com/7d24613558f1bc3463afffcad225df1f/200000023-d8960d8963/nove-logo.png?ph=4759cbf9b9",
      "O",
      "V",
    ],
    [
      "basketball",
      "BK Olomoucko – BK ARMEX ENERGY Děčín",
      "https://cbf.cz/files/392197MDl.png",
      "https://cbf.cz/files/435933YjR.png",
      "O",
      "AD",
    ],
    [
      "ice_hockey",
      "HC Olomouc – HC Oceláři Třinec",
      "https://hc-olomouc.esports.cz/foto/logo_png.png",
      "https://hcocelari.esports.cz/files/logos/Trinec.png",
      "O",
      "OT",
    ],
  ] as const)("exposes governed %s browser fallbacks when the cross-origin renderer cannot load", (
    subcategory,
    title,
    homeLogoUrl,
    awayLogoUrl,
    homeInitials,
    awayInitials,
  ) => {
    expect(resolveCityPostersSportBrowserFallback({
      subcategory,
      title,
    })).toEqual({
      home: { name: title.split(" – ")[0], logoUrl: homeLogoUrl, initials: homeInitials },
      away: { name: title.split(" – ")[1], logoUrl: awayLogoUrl, initials: awayInitials },
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
