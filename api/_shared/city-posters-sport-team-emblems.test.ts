import { describe, expect, it } from "vitest";
import {
  cityPostersSportTeamEmblems,
  cityPostersSportTeamInitials,
  parseCityPostersSportTeams,
  resolveCityPostersSportTeamEmblem,
} from "./city-posters-sport-team-emblems";

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

    expect(resolveCityPostersSportTeamEmblem(teams.homeTeamName)).toMatch(/^https:\/\//);
    expect(resolveCityPostersSportTeamEmblem(teams.awayTeamName)).toMatch(/^https:\/\//);
    expect(cityPostersSportTeamEmblems[homeKey]?.provenance).toBe(homeProvenance);
    expect(cityPostersSportTeamEmblems[awayKey]?.provenance).toBe(awayProvenance);
    expect(cityPostersSportTeamEmblems[homeKey]?.sourceUrl).toMatch(/^https:\/\//);
    expect(cityPostersSportTeamEmblems[awayKey]?.sourceUrl).toMatch(/^https:\/\//);
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
