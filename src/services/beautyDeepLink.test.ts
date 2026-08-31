import { describe, expect, it } from "vitest";
import {
  beautyDeepLinkSelector,
  beautyDeepLinkSlug,
  clearBeautyDeepLink,
  markBeautyDeepLinkFocusHandled,
  pendingBeautyDeepLinkFocusSlug,
} from "./beautyDeepLink";

describe("Beauty service deep links", () => {
  it("resolves a valid Beauty slug only on the Services route", () => {
    expect(beautyDeepLinkSlug("/services", "?beauty=beauty-test")).toBe("beauty-test");
    expect(beautyDeepLinkSlug("/services/", "?beauty=beauty-test")).toBe("beauty-test");
    expect(beautyDeepLinkSlug("/", "?beauty=beauty-test")).toBe("");
    expect(beautyDeepLinkSlug("/services", "?beauty=test")).toBe("");
  });

  it("supports canonical Master public routes without changing the Beauty slug dataset", () => {
    expect(beautyDeepLinkSlug("/masters", "?beauty=beauty-test")).toBe("beauty-test");
    expect(beautyDeepLinkSlug("/master/beauty-test", "")).toBe("beauty-test");
    expect(beautyDeepLinkSlug("/master/beauty-test/cs", "")).toBe("beauty-test");
  });

  it("targets the professional card opener by exact slug", () => {
    expect(beautyDeepLinkSelector("beauty-test")).toBe(
      '[data-beauty-slug="beauty-test"] .services-professional-main',
    );
  });

  it("marks a handled For You focus so remounts do not refocus the same deep link", () => {
    const pathname = "/beauty/beauty-focus-test";
    const search = "?source=telegram";
    expect(pendingBeautyDeepLinkFocusSlug(pathname, search)).toBe("beauty-focus-test");
    markBeautyDeepLinkFocusHandled(pathname, search, "beauty-focus-test");
    expect(pendingBeautyDeepLinkFocusSlug(pathname, search)).toBe("");
    expect(pendingBeautyDeepLinkFocusSlug(pathname, "?source=whatsapp")).toBe("beauty-focus-test");
  });

  it("removes only the consumed Beauty parameter", () => {
    expect(clearBeautyDeepLink("/services", "?beauty=beauty-test&source=telegram", "#details"))
      .toBe("/services?source=telegram#details");
  });
});
