import { describe, expect, it } from "vitest";
import { canShowBeautyWorkspaceEntry, servicesBottomNavigationCount } from "./servicesRoleNavigation";

describe("servicesRoleNavigation", () => {
  it.each(["user", "organizer", "moderator"] as const)("keeps the professional workspace hidden for %s", (role) => {
    expect(canShowBeautyWorkspaceEntry(role)).toBe(false);
    expect(servicesBottomNavigationCount(role)).toBe(5);
  });

  it("keeps the professional workspace in the six-item bottom navigation for professionals", () => {
    expect(canShowBeautyWorkspaceEntry("professional")).toBe(true);
    expect(servicesBottomNavigationCount("professional")).toBe(6);
  });

  it("keeps admin workspace access without adding a sixth bottom-navigation item", () => {
    expect(canShowBeautyWorkspaceEntry("admin")).toBe(true);
    expect(servicesBottomNavigationCount("admin")).toBe(5);
  });
});
