import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  cityPostersSportTeamEmblems,
  cityPostersSportTeamInitials,
  parseCityPostersSportTeams,
  resolveCityPostersSportTeamEmblem,
} from "./city-posters-sport-team-emblems";

describe("AFISHI021B governed team emblems", () => {
  it.each([
    ["RC Olomouc – JIMI RC Vyškov", "official-club", "official-league"],
    ["BK Olomoucko – BK ARMEX ENERGY Děčín", "official-league", "official-league"],
    ["HC Olomouc – HC Oceláři Třinec", "official-club", "official-club"],
  ] as const)("resolves governed real emblems for %s", (title, homeProvenance, awayProvenance) => {
    const teams = parseCityPostersSportTeams(title);
    expect(teams).not.toBeNull();
    if (!teams) return;

    const homeKey = teams.homeTeamName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
    const awayKey = teams.awayTeamName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();

    expect(resolveCityPostersSportTeamEmblem(teams.homeTeamName)).toMatch(/^(https:\/\/|\/city-posters\/team-emblems\/)/);
    expect(resolveCityPostersSportTeamEmblem(teams.awayTeamName)).toMatch(/^(https:\/\/|\/city-posters\/team-emblems\/)/);
    expect(cityPostersSportTeamEmblems[homeKey]?.provenance).toBe(homeProvenance);
    expect(cityPostersSportTeamEmblems[awayKey]?.provenance).toBe(awayProvenance);
    expect(cityPostersSportTeamEmblems[homeKey]?.sourceUrl).toMatch(/^https:\/\//);
    expect(cityPostersSportTeamEmblems[awayKey]?.sourceUrl).toMatch(/^https:\/\//);
  });

  it("uses the official transparent-club asset for Olomouc and the league shield for Vyškov", () => {
    expect(resolveCityPostersSportTeamEmblem("RC Olomouc"))
      .toBe("/city-posters/team-emblems/rc-olomouc-official.svg");
    expect(cityPostersSportTeamEmblems["rc olomouc"]).toMatchObject({
      provenance: "official-club",
      sourceUrl: "https://www.rugbyolomouc.cz/klub/ke-stazeni.html",
    });
    expect(resolveCityPostersSportTeamEmblem("JIMI RC Vyškov"))
      .toBe("https://is.rugbyunion.cz/data//club/logo/c7bc212608e58ac1ef4c6ee78480be62.jpg");
    expect(cityPostersSportTeamEmblems["jimi rc vyskov"]).toMatchObject({
      provenance: "official-league",
      sourceUrl: "https://www.rugbyunion.cz/kluby/jimi-rc-vyskov",
    });
  });

  it("ships the official RC Olomouc emblem as a first-party transparent asset", async () => {
    const assetPath = resolve(process.cwd(), "public/city-posters/team-emblems/rc-olomouc-official.svg");
    expect(existsSync(assetPath)).toBe(true);
    expect(await sharp(assetPath).metadata()).toMatchObject({ format: "svg" });
    const normalized = await sharp(assetPath)
      .resize(280, 190, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const { data, info } = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparentPixels = 0;
    let opaquePixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const alpha = data[offset + 3];
      if (alpha === 0) transparentPixels += 1;
      if (alpha > 220) opaquePixels += 1;
    }
    expect(transparentPixels).toBeGreaterThan(1_000);
    expect(opaquePixels).toBeGreaterThan(1_000);
  });

  it("packages first-party team emblems into Vercel serverless functions", () => {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
      functions?: Record<string, { includeFiles?: string }>;
    };
    const includeFiles = vercel.functions?.["api/**/*.ts"]?.includeFiles;

    expect(includeFiles).toContain("images/activities/share-4x3/**");
    expect(includeFiles).toContain("public/city-posters/team-emblems/**");
  });

  it("uses the current official-club Třinec asset", () => {
    expect(resolveCityPostersSportTeamEmblem("HC Oceláři Třinec"))
      .toBe("https://hcocelari.esports.cz/files/logos/Trinec.png");
    expect(cityPostersSportTeamEmblems["hc ocelari trinec"]).toMatchObject({
      provenance: "official-club",
      sourceUrl: "https://www.hcocelari.cz/",
    });
  });

  it("keeps an approved Sigma emblem and deterministic fallback for an unapproved team", () => {
    expect(resolveCityPostersSportTeamEmblem("SK Sigma Olomouc")).toContain("sigmafotbal.esports.cz");
    expect(cityPostersSportTeamEmblems["sk sigma olomouc"]?.provenance).toBe("official-club");
    expect(resolveCityPostersSportTeamEmblem("MŠK Žilina")).toBeNull();
    expect(cityPostersSportTeamInitials("MŠK Žilina")).toBe("MŽ");
  });

  it("creates deterministic non-logo initials fallback", () => {
    expect(cityPostersSportTeamInitials("Unknown Team")).toBe("UT");
  });
});
