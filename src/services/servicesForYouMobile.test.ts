import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./services-for-you-mobile.css", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

describe("Services For You mobile orientation", () => {
  it("keeps personalized cards compact and swipe-oriented without changing Catalog", () => {
    expect(indexHtml).toContain('/src/services/services-for-you-mobile.css');
    expect(css).toContain("@media (max-width: 699px)");
    expect(css).toContain(".services-for-you-view .services-professional-grid");
    expect(css).toContain("scroll-snap-type: x mandatory");
    expect(css).toContain(".services-for-you-view .service-activity-card");
    expect(css).toContain("flex: 0 0 min(92vw, 420px) !important");
    expect(css).toContain("min-height: clamp(440px, 112vw, 500px) !important");
    expect(css).not.toContain(".services-catalog-view");
    expect(css).not.toContain(".activity-stack");
  });
});
