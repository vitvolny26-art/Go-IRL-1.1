import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(new URL("../components/ProfilePanel.tsx", import.meta.url), "utf8");
const rolesSource = readFileSync(new URL("../components/ProfileRolesSection.tsx", import.meta.url), "utf8");

describe("Activ018 UProfile role catalog UI", () => {
  it("keeps role catalog separate from activity interests", () => {
    expect(panelSource).toContain("ProfileInterestsGoalsSection");
    expect(panelSource).toContain("ProfileRolesSection");
    expect(panelSource).toContain("<ProfileRolesSection language={language} />");
  });

  it("renders canonical roles without inventing role-interest state controls", () => {
    expect(rolesSource).toContain("profileRoleCatalog.map");
    expect(rolesSource).toContain("data-profile-role-id={role.id}");
    expect(rolesSource).not.toContain("<select");
    expect(rolesSource).not.toContain("<input");
    expect(rolesSource).not.toContain("localStorage");
  });
});
