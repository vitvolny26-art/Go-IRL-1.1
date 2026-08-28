import { describe, expect, it } from "vitest";
import { cities, getCity } from "./cities";

const expectedCityIds = [
  "olomouc",
  "prerov",
  "praha",
  "brno",
  "bratislava",
  "krakow",
  "kyiv",
  "kharkiv",
  "odesa",
  "lviv",
];

const uiLanguages = ["ru", "uk", "cs", "en", "pl", "sk"] as const;

describe("cities config", () => {
  it("exposes the approved city set", () => {
    expect(cities.map((city) => city.id)).toEqual(expectedCityIds);
  });

  it("provides UI labels for every supported locale", () => {
    for (const city of cities) {
      for (const language of uiLanguages) expect(city.name[language]).toBeTruthy();
    }
  });

  it("uses the expected country and timezone configuration", () => {
    expect(getCity("bratislava")).toMatchObject({ countryCode: "SK", timezone: "Europe/Bratislava" });
    expect(getCity("brno")).toMatchObject({ countryCode: "CZ", timezone: "Europe/Prague" });
    expect(getCity("krakow")).toMatchObject({ countryCode: "PL", timezone: "Europe/Warsaw" });
    for (const id of ["kyiv", "kharkiv", "odesa", "lviv"]) {
      expect(getCity(id)).toMatchObject({ countryCode: "UA", timezone: "Europe/Kyiv" });
    }
  });
});
