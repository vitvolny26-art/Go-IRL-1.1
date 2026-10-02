import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  cityPostersSportBackgrounds,
  normalizeCityPostersSportType,
  renderCityPostersSportMatchArtworkJpeg,
} from "./city-posters-sport-match-artwork";

const sportTypes = ["football", "ice_hockey", "basketball", "volleyball", "rugby"] as const;

describe("AFISHI021A City Posters sport match artwork", () => {
  it("normalizes supported sport aliases without collapsing different sports", () => {
    expect(normalizeCityPostersSportType("Football")).toBe("football");
    expect(normalizeCityPostersSportType("soccer")).toBe("football");
    expect(normalizeCityPostersSportType("ice hockey")).toBe("ice_hockey");
    expect(normalizeCityPostersSportType("hokej")).toBe("ice_hockey");
    expect(normalizeCityPostersSportType("basketball")).toBe("basketball");
    expect(normalizeCityPostersSportType("volejbal")).toBe("volleyball");
    expect(normalizeCityPostersSportType("ragby")).toBe("rugby");
    expect(normalizeCityPostersSportType("tennis")).toBeNull();
  });

  it("owns five distinct backgrounds for both For You and Catalog", () => {
    const forYou = sportTypes.map((sport) => cityPostersSportBackgrounds[sport]["for-you"]);
    const catalog = sportTypes.map((sport) => cityPostersSportBackgrounds[sport].catalog);

    expect(new Set(forYou.map(String))).toHaveLength(5);
    expect(new Set(catalog.map(String))).toHaveLength(5);
    for (const background of [...forYou, ...catalog]) expect(existsSync(background)).toBe(true);
  });

  it("renders clean JPEG backgrounds at the exact UI contracts when logos are unavailable", async () => {
    const forYou = await renderCityPostersSportMatchArtworkJpeg({
      sportType: "football",
      variant: "for-you",
    });
    const catalog = await renderCityPostersSportMatchArtworkJpeg({
      sportType: "ice_hockey",
      variant: "catalog",
      homeLogoUrl: "not-a-url",
      awayLogoUrl: "http://example.com/logo.png",
    });

    const forYouMetadata = await sharp(forYou).metadata();
    const catalogMetadata = await sharp(catalog).metadata();
    expect(forYouMetadata).toMatchObject({ format: "jpeg", width: 1080, height: 1920 });
    expect(catalogMetadata).toMatchObject({ format: "jpeg", width: 1200, height: 900 });
  });

  it("rejects unsupported sports instead of inventing a generic background", async () => {
    await expect(renderCityPostersSportMatchArtworkJpeg({ sportType: "tennis", variant: "catalog" }))
      .rejects.toThrow("unsupported_sport_type");
  });
});
