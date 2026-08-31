import { describe, expect, it } from "vitest";
import { beautyDeepLinkSelector, beautyDeepLinkSlug, clearBeautyDeepLink } from "./beautyDeepLink";

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

  it("removes a consumed Services query deep link without disturbing other parameters", () => {
    expect(clearBeautyDeepLink("/services", "?beauty=beauty-test&source=telegram", "#details"))
      .toBe("/services?source=telegram#details");
  });

  it("normalizes a consumed professional path back to Services", () => {
    expect(clearBeautyDeepLink("/beauty/beauty-test/cs", "?utm_source=telegram", ""))
      .toBe("/services?utm_source=telegram");
    expect(clearBeautyDeepLink("/master/beauty-test", "", ""))
      .toBe("/services");
  });
});
