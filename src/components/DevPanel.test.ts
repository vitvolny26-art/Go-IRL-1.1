import { describe, expect, it } from "vitest";
import { adminBuildBadgePosition, adminPanelPath, shouldShowAdminDevPanel } from "./DevPanel";

describe("admin build menu", () => {
  it("shows the build badge for admin-class roles", () => {
    expect(shouldShowAdminDevPanel("admin")).toBe(true);
    expect(shouldShowAdminDevPanel("superadmin")).toBe(true);
    expect(shouldShowAdminDevPanel("user")).toBe(false);
    expect(shouldShowAdminDevPanel("organizer")).toBe(false);
    expect(shouldShowAdminDevPanel("moderator")).toBe(false);
  });

  it("opens the dedicated server-verified admin login", () => {
    expect(adminPanelPath).toBe("/admin/login");
  });

  it("keeps the build badge in the upper-left safe area", () => {
    expect(adminBuildBadgePosition).toEqual({
      left: "calc(env(safe-area-inset-left, 0px) + 6px)",
      top: "calc(env(safe-area-inset-top, 0px) + 6px)",
    });
  });
});
