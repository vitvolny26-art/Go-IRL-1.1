import { describe, expect, it } from "vitest";
import {
  adminBuildBadgeHeaderSelector,
  adminBuildBadgePosition,
  adminPanelPath,
  shouldShowAdminDevPanel,
} from "./DevPanel";

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

  it("targets the header controls so desktop keeps the badge in flow", () => {
    expect(adminBuildBadgeHeaderSelector).toBe(".app-header .header-controls");
  });

  it("keeps the upper-right safe-area position as a no-header fallback", () => {
    expect(adminBuildBadgePosition).toEqual({
      right: "calc(env(safe-area-inset-right, 0px) + 6px)",
      top: "calc(env(safe-area-inset-top, 0px) + 6px)",
    });
  });
});
