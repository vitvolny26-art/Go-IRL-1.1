import { describe, expect, it } from "vitest";
import { profileRoleIds } from "./profileRoleCatalog";
import { buildProfileRoleCatalogViewModel } from "./profileRoleViewModel";

describe("UProfile017 role catalog view model", () => {
  it("preserves canonical role ids and catalog order", () => {
    const roles = buildProfileRoleCatalogViewModel("en");

    expect(roles.map((role) => role.id)).toEqual(profileRoleIds);
  });

  it("exposes localized labels without leaking raw catalog structure", () => {
    const roles = buildProfileRoleCatalogViewModel("ru");
    const driver = roles.find((role) => role.id === "driver");

    expect(driver).toEqual({ id: "driver", label: "Водитель" });
    expect(Object.keys(driver || {}).sort()).toEqual(["id", "label"]);
  });

  it("supports the six-locale display contract", () => {
    expect(buildProfileRoleCatalogViewModel("pl").find((role) => role.id === "driver")?.label).toBe("Kierowca");
    expect(buildProfileRoleCatalogViewModel("sk").find((role) => role.id === "mushroom-expert")?.label).toBe("Odborník na huby");
  });
});
