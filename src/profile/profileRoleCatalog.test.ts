import { describe, expect, it } from "vitest";
import {
  getProfileRoleLabel,
  profileRoleCatalog,
  profileRoleIds,
  profileRoleLocales,
} from "./profileRoleCatalog";

describe("UProfile017 profile role catalog", () => {
  it("keeps canonical role ids unique and stable", () => {
    expect(new Set(profileRoleIds).size).toBe(profileRoleIds.length);
    expect(profileRoleCatalog.map((role) => role.id)).toEqual(profileRoleIds);
  });

  it("provides a non-empty display label in all six required locales", () => {
    expect(profileRoleLocales).toEqual(["ru", "uk", "cs", "en", "pl", "sk"]);
    for (const role of profileRoleCatalog) {
      for (const locale of profileRoleLocales) {
        expect(role.labels[locale].trim()).not.toBe("");
      }
    }
  });

  it("keeps localized display names separate from canonical identity", () => {
    expect(getProfileRoleLabel("driver", "ru")).toBe("Водитель");
    expect(getProfileRoleLabel("driver", "pl")).toBe("Kierowca");
    expect(getProfileRoleLabel("mushroom-expert", "sk")).toBe("Odborník na huby");
  });
});
