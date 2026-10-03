import { existsSync, readFileSync } from "node:fs";
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

  it("renders exact UI contracts and deterministic team badges when logos are unavailable", async () => {
    const forYou = await renderCityPostersSportMatchArtworkJpeg({
      sportType: "rugby",
      variant: "for-you",
      homeTeamName: "RC Olomouc",
      awayTeamName: "JIMI RC Vyškov",
      homeLogoUrl: "not-a-url",
    });
    const catalog = await renderCityPostersSportMatchArtworkJpeg({
      sportType: "basketball",
      variant: "catalog",
      homeTeamName: "BK Olomoucko",
      awayTeamName: "BK ARMEX ENERGY Děčín",
    });

    const forYouMetadata = await sharp(forYou).metadata();
    const catalogMetadata = await sharp(catalog).metadata();
    expect(forYouMetadata).toMatchObject({ format: "jpeg", width: 1080, height: 1920 });
    expect(catalogMetadata).toMatchObject({ format: "jpeg", width: 1200, height: 900 });

    const catalogBackground = await sharp(readFileSync(cityPostersSportBackgrounds.basketball.catalog))
      .resize(1200, 900, { fit: "cover", position: "centre" })
      .raw()
      .toBuffer();
    const catalogRendered = await sharp(catalog).raw().toBuffer();

    const meanAbsoluteDifference = (left: number, top: number, width: number, height: number) => {
      let difference = 0;
      let samples = 0;
      for (let y = top; y < top + height; y += 1) {
        for (let x = left; x < left + width; x += 1) {
          const offset = (y * 1200 + x) * 3;
          for (let channel = 0; channel < 3; channel += 1) {
            difference += Math.abs(catalogRendered[offset + channel] - catalogBackground[offset + channel]);
            samples += 1;
          }
        }
      }
      return difference / samples;
    };

    expect(meanAbsoluteDifference(275, 355, 190, 190)).toBeGreaterThan(12);
    expect(meanAbsoluteDifference(735, 355, 190, 190)).toBeGreaterThan(12);
  });

  it("rejects unsupported sports instead of inventing a generic background", async () => {
    await expect(renderCityPostersSportMatchArtworkJpeg({ sportType: "tennis", variant: "catalog" }))
      .rejects.toThrow("unsupported_sport_type");
  });
});
