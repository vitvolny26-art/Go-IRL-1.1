import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import headerSource from "../components/AppHeader.tsx?raw";
import slugEditorSource from "./BeautyPublicSlugEditor.tsx?raw";
import navigationSource from "./ServicesBottomNavigationPortal.tsx?raw";
import roleNavigationSource from "./servicesRoleNavigation.ts?raw";
import pendingHookSource from "./useBeautyProfessionalPendingBookings.ts?raw";

const navigationStyles = readFileSync(
  fileURLToPath(new URL("./ServicesBottomNavigationPortal.css", import.meta.url)),
  "utf8",
);

describe("Beauty services request indicators", () => {
  it("renders the professional link only inside the master Page tab", () => {
    expect(slugEditorSource).toContain('document.querySelector(".beauty-workspace-page-view")');
    expect(slugEditorSource).toContain('path === "/beauty/workspace" || path === "/services/beauty/master"');
    expect(slugEditorSource).not.toContain('document.querySelector(".beauty-workspace-page")');
  });

  it("shows pending server booking requests in the header bell without a bottom-nav workspace badge", () => {
    expect(pendingHookSource).toContain("loadProfessionalServiceBookings");
    expect(pendingHookSource).toContain('booking.status === "pending"');
    expect(navigationSource).not.toContain("services-workspace-notification-badge");
    expect(headerSource).toContain("beautyRequestCopy");
    expect(headerSource).toContain('href="/beauty/workspace"');
  });

  it("keeps six bottom-nav items only for professionals and five for admin/other roles", () => {
    expect(roleNavigationSource).toContain('role === "professional" ? 6 : 5');
    expect(navigationSource).toContain("servicesBottomNavigationCount(userRole) === 6");
    expect(navigationSource).toContain('workspaceLink.style.display = showWorkspaceInBottomNav ? "" : "none"');
    expect(navigationSource).toContain('workspaceLink.style.order = showWorkspaceInBottomNav ? "5" : ""');
    expect(navigationSource).toContain('style={{ order: 4 }}');
    expect(navigationStyles).toContain(".bottom-nav.services-bottom-nav-six");
    expect(navigationStyles).toContain("repeat(6, minmax(0, 1fr))");
  });

  it("moves the professional count into a visible single-line upper-left card badge", () => {
    expect(navigationSource).toContain("services-category-professional-count");
    expect(navigationSource).toContain('.category-button[data-category=creativity]>small');
    expect(navigationSource).not.toContain('.category-grid.module-grid.services-category-grid .category-button[data-category="creativity"] > small');
    expect(navigationSource).toContain('small.dataset.servicesSourceCopy = source');
    expect(navigationStyles).toContain(".category-grid.module-grid .category-button > .services-category-professional-count");
    expect(navigationStyles).toContain("display: block");
    expect(navigationStyles).toContain("white-space: nowrap");
    expect(navigationStyles).toContain("top: 12px");
    expect(navigationStyles).toContain("left: 12px");
  });
});
