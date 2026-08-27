import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./AdminLoginPage.tsx", import.meta.url)), "utf8");

describe("Admin Activity organizer reassignment UI contract", () => {
  it("renders the control only after a trusted superadmin session role", () => {
    const panel = source.indexOf("function ActivityOrganizerReassignmentPanel()");
    const trustedRole = source.indexOf("requestCurrentAdminRole()", panel);
    const roleGuard = source.indexOf('if (currentRole !== "superadmin") return null;', trustedRole);
    const mutation = source.indexOf("requestActivityOrganizerReassignment", roleGuard);
    expect(panel).toBeGreaterThan(-1);
    expect(trustedRole).toBeGreaterThan(panel);
    expect(roleGuard).toBeGreaterThan(trustedRole);
    expect(mutation).toBeGreaterThan(roleGuard);
  });

  it("offers only organizer role assignments as targets", () => {
    expect(source).toContain('assignments.filter((assignment) => assignment.role === "organizer")');
  });

  it("requires explicit confirmation before mutation", () => {
    const confirm = source.indexOf("window.confirm");
    const mutation = source.indexOf("await requestActivityOrganizerReassignment", confirm);
    expect(confirm).toBeGreaterThan(-1);
    expect(mutation).toBeGreaterThan(confirm);
  });
});
