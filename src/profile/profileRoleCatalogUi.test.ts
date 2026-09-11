import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(new URL("../components/ProfilePanel.tsx", import.meta.url), "utf8");
const rolesSource = readFileSync(new URL("../components/ProfileRolesSection.tsx", import.meta.url), "utf8");

describe("UProfile017 role catalog UI", () => {
  it("keeps role catalog separate from activity interests", () => {
    expect(panelSource).toContain("ProfileInterestsGoalsSection");
    expect(panelSource).toContain("ProfileRolesSection");
    expect(panelSource).toContain("<ProfileRolesSection language={language} />");
  });

  it("renders canonical roles through the bounded view model", () => {
    expect(rolesSource).toContain("buildProfileRoleCatalogViewModel(language)");
    expect(rolesSource).toContain("data-profile-role-id={role.id}");
    expect(rolesSource).toContain("{role.label}");
    expect(rolesSource).not.toContain("profileRoleCatalog");
  });

  it("does not invent role-interest state controls or persistence", () => {
    expect(rolesSource).not.toContain("<select");
    expect(rolesSource).not.toContain("<input");
    expect(rolesSource).not.toContain("localStorage");
  });
});
