import { describe, expect, it } from "vitest";
import { adminPanelPath, shouldShowAdminDevPanel } from "./DevPanel";

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
});
