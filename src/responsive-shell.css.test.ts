import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const responsiveShellCss = readFileSync(new URL("./responsive-shell.css", import.meta.url), "utf8");

describe("WEB001 desktop Activities reflow", () => {
  it("uses one three-column desktop grid contract for Activities surfaces", () => {
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .activity-stack,\n  html[data-go-irl-client="web"] .discover-page .horizontal-events`);
    expect(responsiveShellCss).toContain("grid-template-columns: repeat(3,minmax(0,1fr));");
  });

  it("turns For You carousels into desktop grids without changing mobile defaults", () => {
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .discover-page .horizontal-events {\n    display: grid;`);
    expect(responsiveShellCss).toContain("scroll-snap-type: none;");
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .discover-page .horizontal-events > .activity-card`);
  });

  it("spans desktop loading and empty states across the complete Activities grid", () => {
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .activity-stack > .empty-state,`);
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .activity-stack > .event-list-skeleton,`);
    expect(responsiveShellCss).toContain("grid-column: 1 / -1;");
  });
});
