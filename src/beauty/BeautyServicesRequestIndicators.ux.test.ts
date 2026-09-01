import { describe, expect, it } from "vitest";
import headerSource from "../components/AppHeader.tsx?raw";
import slugEditorSource from "./BeautyPublicSlugEditor.tsx?raw";
import navigationSource from "./ServicesBottomNavigationPortal.tsx?raw";
import pendingHookSource from "./useBeautyProfessionalPendingBookings.ts?raw";

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
    expect(navigationSource).toContain('target.classList.toggle("services-bottom-nav-six"');
    expect(navigationSource).toContain("grid-template-columns: repeat(6, minmax(0, 1fr)) !important");
    expect(navigationSource).toContain('html[data-go-irl-client="web"] .bottom-nav.services-bottom-nav-six');
  });

  it("renders the professional count separately in the upper-left of the Beauty card", () => {
    expect(navigationSource).toContain("services-category-professional-count");
    expect(navigationSource).toContain("services-category-professional-description");
    expect(navigationSource).toContain("white-space: nowrap");
    expect(navigationSource).toContain("top: 12px");
    expect(navigationSource).toContain("left: 12px");
  });
});
