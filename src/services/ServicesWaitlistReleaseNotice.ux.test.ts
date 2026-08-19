import { describe, expect, it } from "vitest";
import noticeSource from "./ServicesWaitlistReleaseNotice.tsx?raw";
import portalSource from "./ServicesBookingsPortal.tsx?raw";

describe("Beauty waitlist release in-app notice", () => {
  it("uses durable server waitlist notification state", () => {
    expect(noticeSource).toContain("loadMyServiceWaitlist(language)");
    expect(noticeSource).toContain("Boolean(entry.lastNotifiedAt)");
    expect(noticeSource).toContain('snapshot.source === "server"');
  });

  it("keeps the non-reservation disclaimer visible", () => {
    expect(noticeSource).toContain("Место не зарезервировано");
    expect(noticeSource).toContain('data-services-waitlist-release-notice');
  });

  it("is mounted on the existing services bookings portal", () => {
    expect(portalSource).toContain("ServicesWaitlistReleaseNotice");
    expect(portalSource).toContain("<ServicesWaitlistReleaseNotice language={language} />");
  });
});
