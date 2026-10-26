import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  cityPostersSportTeamEmblems,
  cityPostersSportTeamInitials,
  parseCityPostersSportTeams,
  resolveCityPostersSportTeamEmblem,
  resolveCityPostersSportTeamRendererEmblem,
} from "./city-posters-sport-team-emblems";
import { cityPostersSportFirstPartyLogoAssets } from "./city-posters-sport-match-artwork";

describe("SPORT001 added match emblems", () => {
  it.each([
    ["RC Olomouc", "rugby/rc-olomouc"],
    ["TJ Sokol Mariánské Hory", "rugby/tj-sokol-marianske-hory"],
    ["VK Prostějov B", "volleyball/vk-prostejov-b"],
    ["VELORY Olomouc", "volleyball/velory-olomouc"],
    ["BK Olomoucko", "basketball/bk-olomoucko"],
    ["BK Loko BaliMania Plzeň", "basketball/bk-loko-balimania-plzen"],
    ["FC Slovan Liberec", "football/fc-slovan-liberec"],
    ["HC Dynamo Pardubice", "ice-hockey/hc-dynamo-pardubice"],
    ["BK Mladá Boleslav", "ice-hockey/bk-mlada-boleslav"],
    ["BYD Energie Karlovy Vary", "ice-hockey/byd-energie-karlovy-vary"],
  ])("resolves local image for %s", (name, slug) => {
    const url = resolveCityPostersSportTeamRendererEmblem(name);
    expect(url).toBe(`/city-posters/sports/${slug.split("/")[0]}/team-emblems/${slug.split("/")[1]}.png`);
    expect(existsSync(resolve(process.cwd(), "images", url!.slice(1)))).toBe(true);
  });
  it("resolves every repository sport-team PNG as a first-party browser and JPEG emblem", () => {
    let total = 0;
    for (const sport of ["basketball", "football", "ice-hockey", "rugby", "volleyball"]) {
      const directory = resolve(process.cwd(), "images/city-posters/sports", sport, "team-emblems");
      for (const filename of readdirSync(directory).filter((name) => name.endsWith(".png"))) {
        const teamName = filename.slice(0, -4).replace(/-/g, " ");
        const url = `/city-posters/sports/${sport}/team-emblems/${filename}`;
        expect(resolveCityPostersSportTeamEmblem(teamName)).toBe(url);
        expect(resolveCityPostersSportTeamRendererEmblem(teamName)).toBe(url);
        expect(cityPostersSportFirstPartyLogoAssets[url]).toBeDefined();
        expect(existsSync(cityPostersSportFirstPartyLogoAssets[url])).toBe(true);
        total++;
      }
    }
    expect(total).toBe(66);
  });

});

describe("AFISHI021B governed team emblems", () => {
  it.each([
    ["RC Olomouc – JIMI RC Vyškov", "official-club", "official-club"],
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

    expect(resolveCityPostersSportTeamEmblem(teams.homeTeamName)).toMatch(/^(https:\/\/|\/city-posters\/(?:team-emblems|sports\/[^/]+\/team-emblems)\/)/);
    expect(resolveCityPostersSportTeamEmblem(teams.awayTeamName)).toMatch(/^(https:\/\/|\/city-posters\/(?:team-emblems|sports\/[^/]+\/team-emblems)\/)/);
    expect(cityPostersSportTeamEmblems[homeKey]?.provenance).toBe(homeProvenance);
    expect(cityPostersSportTeamEmblems[awayKey]?.provenance).toBe(awayProvenance);
    expect(cityPostersSportTeamEmblems[homeKey]?.sourceUrl).toMatch(/^https:\/\//);
    expect(cityPostersSportTeamEmblems[awayKey]?.sourceUrl).toMatch(/^https:\/\//);
  });

  it("uses the first-party transparent Olomouc asset and the official club Vyškov PNG", () => {
    expect(resolveCityPostersSportTeamEmblem("RC Olomouc"))
      .toBe("/city-posters/sports/rugby/team-emblems/rc-olomouc.png");
    expect(cityPostersSportTeamEmblems["rc olomouc"]).toMatchObject({
      provenance: "official-club",
      sourceUrl: "https://www.rugbyolomouc.cz/klub/ke-stazeni.html",
    });
    expect(resolveCityPostersSportTeamEmblem("JIMI RC Vyškov"))
      .toBe("/city-posters/sports/rugby/team-emblems/jimi-rc-vyskov.png");
    expect(cityPostersSportTeamEmblems["jimi rc vyskov"]).toMatchObject({
      provenance: "official-club",
      sourceUrl: "https://www.rugbyvyskov.cz/",
      rendererUrl: "/city-posters/sports/rugby/team-emblems/jimi-rc-vyskov.png",
      rendererProvenance: "official-league",
      rendererSourceUrl: "https://www.rugbyunion.cz/kluby/jimi-rc-vyskov",
    });
    expect(resolveCityPostersSportTeamEmblem("BK Olomoucko")).toBe("/city-posters/sports/basketball/team-emblems/bk-olomoucko.png");
    expect(resolveCityPostersSportTeamRendererEmblem("BK Olomoucko")).toBe("/city-posters/sports/basketball/team-emblems/bk-olomoucko.png");
    expect(cityPostersSportTeamEmblems["rc olomouc"]?.url).toMatch(/\.png$/);
    expect(cityPostersSportTeamEmblems["jimi rc vyskov"]?.url).toMatch(/\.png(?:\?|$)/);
    expect(cityPostersSportTeamEmblems["jimi rc vyskov"]?.url).not.toMatch(/\.jpe?g(?:\?|$)/);
    expect(resolveCityPostersSportTeamRendererEmblem("RC Olomouc"))
      .toBe("/city-posters/sports/rugby/team-emblems/rc-olomouc.png");
    expect(resolveCityPostersSportTeamRendererEmblem("JIMI RC Vyškov"))
      .toBe("/city-posters/sports/rugby/team-emblems/jimi-rc-vyskov.png");
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
    expect(includeFiles).toContain("images/city-posters/sports/**/team-emblems/**");
  });

  it("uses the current official-club Třinec asset", () => {
    expect(resolveCityPostersSportTeamEmblem("HC Oceláři Třinec"))
      .toBe("/city-posters/sports/ice-hockey/team-emblems/hc-ocelari-trinec.png");
    expect(cityPostersSportTeamEmblems["hc ocelari trinec"]).toMatchObject({
      provenance: "official-club",
      sourceUrl: "https://www.hcocelari.cz/",
    });
  });

  it("keeps an approved Sigma emblem and deterministic fallback for an unapproved team", () => {
    expect(resolveCityPostersSportTeamEmblem("SK Sigma Olomouc"))
      .toBe("/city-posters/sports/football/team-emblems/sk-sigma-olomouc.png");
    expect(resolveCityPostersSportTeamEmblem("HC Olomouc"))
      .toBe("/city-posters/sports/ice-hockey/team-emblems/hc-olomouc.png");
    expect(cityPostersSportTeamEmblems["sk sigma olomouc"]?.provenance).toBe("official-club");
    expect(resolveCityPostersSportTeamEmblem("MŠK Žilina")).toBeNull();
    expect(cityPostersSportTeamInitials("MŠK Žilina")).toBe("MŽ");
  });

  it("creates deterministic non-logo initials fallback", () => {
    expect(cityPostersSportTeamInitials("Unknown Team")).toBe("UT");
  });
});
