import { describe, expect, it } from "vitest";
import {
  cityPostersSportTeamInitials,
  parseCityPostersSportTeams,
  resolveCityPostersSportTeamEmblem,
} from "./city-posters-sport-team-emblems";

describe("AFISHI021A governed team emblems", () => {
  it("parses the two factual teams", () => {
    expect(parseCityPostersSportTeams("RC Olomouc – JIMI RC Vyškov")).toEqual({
      homeTeamName: "RC Olomouc",
      awayTeamName: "JIMI RC Vyškov",
    });
  });

  it("resolves only governed real emblems", () => {
    expect(resolveCityPostersSportTeamEmblem("RC Olomouc")).toContain("rugbyolomouc.cz");
    expect(resolveCityPostersSportTeamEmblem("Unknown Team")).toBeNull();
  });

  it("creates deterministic non-logo initials fallback", () => {
    expect(cityPostersSportTeamInitials("JIMI RC Vyškov")).toBe("V");
    expect(cityPostersSportTeamInitials("BK Olomoucko")).toBe("O");
  });
});
