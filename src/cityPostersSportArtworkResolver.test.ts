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
      "https://go-irl-1-1.vercel.app/api/telegram/event-share-card?slug=rc-olomouc-jimi-rc-vyskov-2026-10-04&variant=for-you&mode=city-posters-sport&v=afishi021b-boleslav-1p1-v4",
    );
  });

  it.each([
    [
      "rugby",
      "RC Olomouc – JIMI RC Vyškov",
      "/city-posters/sports/rugby/team-emblems/rc-olomouc.png",
      "/city-posters/sports/rugby/team-emblems/jimi-rc-vyskov.png",
      "O",
      "V",
    ],
    [
      "basketball",
      "BK Olomoucko – BK ARMEX ENERGY Děčín",
      "/city-posters/sports/basketball/team-emblems/bk-olomoucko.png",
      "/city-posters/sports/basketball/team-emblems/bk-armex-energy-decin.png",
      "O",
      "AD",
    ],
    [
      "ice_hockey",
      "HC Olomouc – HC Oceláři Třinec",
      "/city-posters/sports/ice-hockey/team-emblems/hc-olomouc.png",
      "/city-posters/sports/ice-hockey/team-emblems/hc-ocelari-trinec.png",
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
