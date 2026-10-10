import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  cityPostersSportBackgrounds,
  cityPostersSportFirstPartyLogoAssets,
  normalizeCityPostersSportType,
  normalizeCityPostersSportLogo,
  recolorCityPostersSportPlzenWordmarkToWhite,
  renderCityPostersSportMatchArtworkJpeg,
} from "./city-posters-sport-match-artwork";

const sportTypes = ["football", "ice_hockey", "basketball", "volleyball", "rugby"] as const;

describe("SPORT001 first-party PNG assets", () => {
  it("maps new team PNG URLs to filesystem assets", () => {
    for (const slug of ["rugby/rc-olomouc","rugby/tj-sokol-marianske-hory","volleyball/vk-prostejov-b","volleyball/velory-olomouc","basketball/bk-loko-balimania-plzen","football/fc-slovan-liberec","ice-hockey/hc-dynamo-pardubice","ice-hockey/bk-mlada-boleslav","ice-hockey/byd-energie-karlovy-vary"]) {
      const [sport, team] = slug.split("/");
      const url = `/city-posters/sports/${sport}/team-emblems/${team}.png`;
      expect(existsSync(cityPostersSportFirstPartyLogoAssets[url])).toBe(true);
    }
  });
});

describe("SPORT001B Plzeň wordmark contrast", () => {
  it("recolors the dark PLZEŇ wordmark to white without changing its shape", async () => {
    const source = readFileSync(cityPostersSportFirstPartyLogoAssets[
      "/city-posters/sports/basketball/team-emblems/bk-loko-balimania-plzen.png"
    ]);
    const normalized = await normalizeCityPostersSportLogo(source, 280, 190);
    const recolored = await recolorCityPostersSportPlzenWordmarkToWhite(normalized);
    const { data: original, info } = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const updated = await sharp(recolored).ensureAlpha().raw().toBuffer();
    const wordmarkTop = Math.floor(info.height * 0.58);
    let recoloredPixels = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        const isDark = original[i + 3] >= 32 && Math.max(original[i], original[i + 1], original[i + 2]) <= 80;
        if (y < wordmarkTop || !isDark) continue;
        if (updated[i] === 255 && updated[i + 1] === 255 && updated[i + 2] === 255 && updated[i + 3] === original[i + 3]) recoloredPixels++;
      }
    }
    expect(recoloredPixels).toBeGreaterThan(0);
  });
});

describe("AFISHI021A City Posters sport match artwork", () => {
  it("keeps sharp lazy on the Vercel serverless initialization path", () => {
    const artworkSource = readFileSync(resolve(process.cwd(), "api/_shared/city-posters-sport-match-artwork.ts"), "utf8");
    const handlerSource = readFileSync(resolve(process.cwd(), "api/telegram/event-share-card.ts"), "utf8");

    expect(artworkSource).not.toContain('import sharp from "sharp"');
    expect(handlerSource).not.toContain('import sharp from "sharp"');
    expect(artworkSource).toContain('import("sharp")');
    expect(handlerSource).toContain('import("sharp")');
    expect(artworkSource).not.toContain("process.cwd()");
    expect(existsSync(cityPostersSportFirstPartyLogoAssets["/city-posters/team-emblems/rc-olomouc-official.svg"])).toBe(true);
  });

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

  it("normalizes padded wordmarks into wider slots without moving team centers", async () => {
    const wideLogo = await sharp({
      create: {
        width: 500,
        height: 200,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite([{
      input: await sharp({
        create: {
          width: 300,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 255, alpha: 1 },
        },
      }).png().toBuffer(),
      left: 100,
      top: 50,
    }]).png().toBuffer();
    const squareLogo = await sharp({
      create: {
        width: 190,
        height: 190,
        channels: 4,
        background: { r: 0, g: 255, b: 255, alpha: 1 },
      },
    }).png().toBuffer();

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(url.includes("home-wide") ? wideLogo : squareLogo, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }));

    try {
      const rendered = await renderCityPostersSportMatchArtworkJpeg({
        sportType: "basketball",
        variant: "catalog",
        homeTeamName: "Wide Home",
        awayTeamName: "Square Away",
        homeLogoUrl: "https://example.test/home-wide.png",
        awayLogoUrl: "https://example.test/away-square.png",
      });
      const { data, info } = await sharp(rendered).raw().toBuffer({ resolveWithObject: true });
      const bounds = (
        matches: (r: number, g: number, b: number) => boolean,
        region: { left: number; top: number; width: number; height: number },
      ) => {
        let minX = region.left + region.width;
        let maxX = -1;
        let minY = region.top + region.height;
        let maxY = -1;
        for (let y = region.top; y < region.top + region.height; y += 1) {
          for (let x = region.left; x < region.left + region.width; x += 1) {
            const offset = (y * info.width + x) * info.channels;
            if (!matches(data[offset], data[offset + 1], data[offset + 2])) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
        return {
          width: maxX >= minX ? maxX - minX + 1 : 0,
          height: maxY >= minY ? maxY - minY + 1 : 0,
          centerX: maxX >= minX ? (minX + maxX) / 2 : -1,
        };
      };

      const wide = bounds(
        (r, g, b) => r > 220 && b > 220 && g < 60,
        { left: 230, top: 355, width: 280, height: 190 },
      );
      const square = bounds(
        (r, g, b) => g > 220 && b > 220 && r < 60,
        { left: 690, top: 355, width: 280, height: 190 },
      );
      expect(wide.width).toBeGreaterThan(240);
      expect(square.height).toBeGreaterThan(175);
      expect(wide.centerX).toBeCloseTo(370, -1);
      expect(square.centerX).toBeCloseTo(830, -1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("removes only the edge-connected light background from JPEG emblems", async () => {
    const source = await sharp({
      create: {
        width: 300,
        height: 220,
        channels: 3,
        background: { r: 252, g: 252, b: 250 },
      },
    }).composite([
      {
        input: await sharp({
          create: { width: 180, height: 140, channels: 3, background: { r: 185, g: 28, b: 42 } },
        }).jpeg({ quality: 98 }).toBuffer(),
        left: 60,
        top: 40,
      },
      {
        input: await sharp({
          create: { width: 100, height: 60, channels: 3, background: { r: 250, g: 250, b: 248 } },
        }).jpeg({ quality: 98 }).toBuffer(),
        left: 100,
        top: 80,
      },
    ]).jpeg({ quality: 95 }).toBuffer();

    const normalized = await normalizeCityPostersSportLogo(source, 280, 190);
    const { data, info } = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0;
    let opaqueWhite = 0;
    let opaqueRed = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const [r, g, b, alpha] = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
      if (alpha < 12) transparent += 1;
      if (alpha > 220 && r > 235 && g > 235 && b > 235) opaqueWhite += 1;
      if (alpha > 220 && r > 140 && g < 90 && b < 100) opaqueRed += 1;
    }
    expect(transparent).toBeGreaterThan(2_000);
    expect(opaqueWhite).toBeGreaterThan(500);
    expect(opaqueRed).toBeGreaterThan(2_000);
  });

  it("renders the first-party RC Olomouc emblem instead of the deterministic O badge", async () => {
    const withOfficialEmblem = await renderCityPostersSportMatchArtworkJpeg({
      sportType: "rugby",
      variant: "catalog",
      homeTeamName: "RC Olomouc",
      awayTeamName: "JIMI RC Vyškov",
      homeLogoUrl: "/city-posters/team-emblems/rc-olomouc-official.svg",
      awayLogoUrl: "not-a-url",
    });
    const withBadgeFallback = await renderCityPostersSportMatchArtworkJpeg({
      sportType: "rugby",
      variant: "catalog",
      homeTeamName: "RC Olomouc",
      awayTeamName: "JIMI RC Vyškov",
      homeLogoUrl: "not-a-url",
      awayLogoUrl: "not-a-url",
    });

    const official = await sharp(withOfficialEmblem).raw().toBuffer();
    const fallback = await sharp(withBadgeFallback).raw().toBuffer();
    let difference = 0;
    let samples = 0;
    for (let y = 355; y < 545; y += 1) {
      for (let x = 230; x < 510; x += 1) {
        const offset = (y * 1200 + x) * 3;
        difference += Math.abs(official[offset] - fallback[offset]);
        difference += Math.abs(official[offset + 1] - fallback[offset + 1]);
        difference += Math.abs(official[offset + 2] - fallback[offset + 2]);
        samples += 3;
      }
    }
    expect(difference / samples).toBeGreaterThan(8);
  });

  it("fails closed instead of baking initials when a configured first-party emblem is missing", async () => {
    await expect(renderCityPostersSportMatchArtworkJpeg({
      sportType: "rugby",
      variant: "catalog",
      homeTeamName: "RC Olomouc",
      awayTeamName: "JIMI RC Vyškov",
      homeLogoUrl: "/city-posters/team-emblems/missing-official.svg",
      awayLogoUrl: "not-a-url",
    })).rejects.toThrow("first_party_logo_unavailable");
  });

  it("rejects unsupported sports instead of inventing a generic background", async () => {
    await expect(renderCityPostersSportMatchArtworkJpeg({ sportType: "tennis", variant: "catalog" }))
      .rejects.toThrow("unsupported_sport_type");
  });
});
