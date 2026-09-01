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

  it("shows pending server booking requests on Services navigation and header bell", () => {
    expect(pendingHookSource).toContain("loadProfessionalServiceBookings");
    expect(pendingHookSource).toContain('booking.status === "pending"');
    expect(navigationSource).toContain("services-workspace-notification-badge");
    expect(headerSource).toContain("beautyRequestCopy");
    expect(headerSource).toContain('href="/beauty/workspace"');
  });

  it("keeps six-item professional Services navigation in one mobile row", () => {
    expect(navigationSource).toContain('target.classList.toggle("services-bottom-nav-six", showWorkspace)');
    expect(navigationSource).not.toContain("servicesBottomNavigationCount");
    expect(navigationSource).not.toContain("classObserver");
    expect(navigationStyles).toContain(".bottom-nav.services-bottom-nav-six");
    expect(navigationStyles).toContain("grid-template-columns: repeat(6, minmax(0, 1fr)) !important");
    expect(navigationStyles).not.toContain(":has(");
    expect(navigationStyles).toContain('html[data-go-irl-client="web"]');
  });

  it("moves the professional count into a single-line upper-left card badge", () => {
    expect(navigationSource).toContain('.category-grid.module-grid .category-button[data-category="creativity"] > small');
    expect(navigationSource).not.toContain('.services-category-grid .category-button[data-category="creativity"] > small');
    expect(navigationSource).toContain("services-category-professional-count");
    expect(navigationSource).toContain('small.dataset.servicesSourceCopy = source');
    expect(navigationStyles).toContain("white-space: nowrap");
    expect(navigationStyles).toContain("top: 12px");
    expect(navigationStyles).toContain("left: 12px");
  });
});
