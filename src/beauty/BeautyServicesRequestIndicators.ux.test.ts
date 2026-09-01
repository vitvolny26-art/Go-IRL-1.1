import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import headerSource from "../components/AppHeader.tsx?raw";
import slugEditorSource from "./BeautyPublicSlugEditor.tsx?raw";
import navigationSource from "./ServicesBottomNavigationPortal.tsx?raw";
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

  it("hides the professional workspace from Services bottom navigation for every role", () => {
    expect(navigationSource).toContain('workspaceLink.hidden = true');
    expect(navigationSource).not.toContain("canShowBeautyWorkspaceEntry");
    expect(navigationSource).not.toContain("services-bottom-nav-six");
    expect(navigationStyles).not.toContain("services-bottom-nav-six");
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
