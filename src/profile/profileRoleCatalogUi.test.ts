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

  it("renders the approved three-level selector as transient UI state", () => {
    expect(rolesSource).toContain("profileRoleInterestLevelIds.map");
    expect(rolesSource).toContain("data-profile-role-level={levelId}");
    expect(rolesSource).toContain("aria-pressed={selected}");
    expect(rolesSource).toContain("useState<RoleLevelSelection>");
  });

  it("does not persist role-interest choices yet", () => {
    expect(rolesSource).not.toContain("localStorage");
    expect(rolesSource).not.toContain("sessionStorage");
    expect(rolesSource).not.toContain("fetch(");
    expect(rolesSource).not.toContain("supabase");
  });
});
