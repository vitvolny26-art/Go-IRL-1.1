import { describe, expect, it } from "vitest";
import { cities, getCity } from "./cities";

const expectedCityIds = [
  "olomouc",
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

  it("links the verified Kharkiv Telegram community without inventing category topic ids", () => {
    const community = getCity("kharkiv").telegramCommunity;
    expect(community).toEqual({
      chatId: -1003919911341,
      url: "https://t.me/GoIRL_Kharkiv",
    });
    expect(community?.topicIds).toBeUndefined();
  });

  it("keeps Olomouc categorized Telegram topic routing intact", () => {
    const community = getCity("olomouc").telegramCommunity;
    expect(community?.topicIds?.chat).toBe(2);
    expect(community?.topicIds?.sport).toBe(5);
  });
});
