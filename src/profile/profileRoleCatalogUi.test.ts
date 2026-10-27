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

  it("renders the approved three-level selector through the shared persistence contract", () => {
    expect(rolesSource).toContain("profileRoleInterestLevelIds.map");
    expect(rolesSource).toContain("data-profile-role-level={levelId}");
    expect(rolesSource).toContain("aria-pressed={selected}");
    expect(rolesSource).toContain("useState<ProfileRoleInterestSelection>");
    expect(rolesSource).toContain("setProfileRoleInterest(");
  });

  it("loads and atomically saves owner role interests through the shared repository", () => {
    expect(rolesSource).toContain("SupabaseProfileRoleInterestRepository");
    expect(rolesSource).toContain("repository.loadOwnRoleInterests()");
    expect(rolesSource).toContain("repository.saveOwnRoleInterests(next)");
    expect(rolesSource).toContain("initializeTrustedAuth()");
    expect(rolesSource).toContain('status === "saving"');
    expect(rolesSource).toContain("setLevelsByRole(previous)");
    expect(rolesSource).toContain('status === "load-error"');
    expect(rolesSource).toContain('setStatus("save-error")');
  });

  it("does not create a browser shadow store for role interests", () => {
    expect(rolesSource).not.toContain("localStorage");
    expect(rolesSource).not.toContain("sessionStorage");
    expect(rolesSource).not.toContain("fetch(");
  });
});
