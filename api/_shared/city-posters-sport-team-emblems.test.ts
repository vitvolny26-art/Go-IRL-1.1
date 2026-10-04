import { describe, expect, it } from "vitest";
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

    expect(resolveCityPostersSportTeamEmblem(teams.homeTeamName)).toMatch(/^https:\/\//);
    expect(resolveCityPostersSportTeamEmblem(teams.awayTeamName)).toMatch(/^https:\/\//);
    expect(cityPostersSportTeamEmblems[homeKey]?.provenance).toBe(homeProvenance);
    expect(cityPostersSportTeamEmblems[awayKey]?.provenance).toBe(awayProvenance);
    expect(cityPostersSportTeamEmblems[homeKey]?.sourceUrl).toMatch(/^https:\/\//);
    expect(cityPostersSportTeamEmblems[awayKey]?.sourceUrl).toMatch(/^https:\/\//);
  });

  it("uses the official transparent-club asset for Olomouc and the league shield for Vyškov", () => {
    expect(resolveCityPostersSportTeamEmblem("RC Olomouc"))
      .toBe("https://www.rugbyolomouc.cz/files/uploads/fanzone/Logo/Logo%20RUGBY%20CLUB%20Olomouc.png");
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
