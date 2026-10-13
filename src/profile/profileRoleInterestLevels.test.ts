import { describe, expect, it } from "vitest";
import { profileRoleLocales } from "./profileRoleCatalog";
import {
  getProfileRoleInterestLevelLabel,
  isProfileRoleInterestLevelId,
  profileRoleInterestLevelIds,
  profileRoleInterestLevels,
} from "./profileRoleInterestLevels";

describe("UProfile017 role interest levels", () => {
  it("keeps the approved three-level contract stable", () => {
    expect(profileRoleInterestLevelIds).toEqual(["want_to_try", "can_help", "professional"]);
    expect(profileRoleInterestLevels.map((level) => level.id)).toEqual(profileRoleInterestLevelIds);
  });

  it("provides display labels for all six role locales", () => {
    for (const level of profileRoleInterestLevels) {
      for (const locale of profileRoleLocales) {
        expect(level.labels[locale].trim()).not.toBe("");
      }
    }
  });

  it("keeps localized labels separate from canonical level identity", () => {
    expect(getProfileRoleInterestLevelLabel("want_to_try", "ru")).toBe("Хочу попробовать");
    expect(getProfileRoleInterestLevelLabel("can_help", "cs")).toBe("Mohu pomoci");
    expect(getProfileRoleInterestLevelLabel("professional", "pl")).toBe("Profesjonalista");
  });

  it("rejects non-canonical level strings", () => {
    expect(isProfileRoleInterestLevelId("professional")).toBe(true);
    expect(isProfileRoleInterestLevelId("expert")).toBe(false);
    expect(isProfileRoleInterestLevelId("Профессионал")).toBe(false);
  });
});
