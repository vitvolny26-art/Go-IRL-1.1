import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const responsiveShellCss = readFileSync(new URL("./responsive-shell.css", import.meta.url), "utf8");
const professionalProfileSource = readFileSync(new URL("./beauty/BeautyProfessionalProfilePortal.tsx", import.meta.url), "utf8");
const professionalProfileOverridesCss = readFileSync(new URL("./beauty/beauty-professional-profile-overrides.css", import.meta.url), "utf8");

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

describe("WEB001 desktop Services reflow", () => {
  it("reserves a three-square-card row on Services Home without adding placeholders", () => {
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .category-grid.module-grid.services-category-grid');
    expect(responsiveShellCss).toContain("grid-template-columns: repeat(3,minmax(0,1fr));");
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .category-grid.module-grid.services-category-grid .category-button');
  });

  it("uses the same three-column desktop density from the web breakpoint", () => {
    expect(responsiveShellCss).toMatch(/@media \(min-width: 960px\)[\s\S]*html\[data-go-irl-client="web"\] \.services-professional-grid \{[\s\S]*grid-template-columns: repeat\(3,minmax\(0,1fr\)\);/);
    expect(responsiveShellCss).not.toContain("@media (min-width: 1280px)");
  });

  it("keeps the opened professional detail in a desktop-only two-column shell", () => {
    expect(professionalProfileSource).toContain('className="beauty-pro-profile-intro"');
    expect(professionalProfileSource).toContain('className="beauty-pro-profile-content"');
    expect(responsiveShellCss).toContain("grid-template-columns: minmax(360px,.82fr) minmax(0,1.18fr);");
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .beauty-pro-profile-shell:not(.beauty-pro-profile-state)');
  });

  it("wins over the legacy full-screen profile dimensions on desktop web", () => {
    expect(professionalProfileOverridesCss).toContain("width:min(620px,100%)!important;");
    expect(professionalProfileOverridesCss).toContain("height:100dvh!important;");
    expect(responsiveShellCss).toContain("align-items: center !important;");
    expect(responsiveShellCss).toContain("padding: 32px !important;");
    expect(responsiveShellCss).toContain("width: min(1120px,100%) !important;");
    expect(responsiveShellCss).toContain("height: min(880px,calc(100dvh - 64px)) !important;");
    expect(responsiveShellCss).toContain("max-height: calc(100dvh - 64px) !important;");
    expect(responsiveShellCss).toContain("border-radius: 28px !important;");
  });
});

describe("WEB001 desktop Header/Auth alignment", () => {
  it("aligns the launch header and content to the same desktop grid", () => {
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .launch-home .header-inner');
    expect(responsiveShellCss).toMatch(/\.launch-home \.header-inner \{[\s\S]*width:min\(100%,1120px\);[\s\S]*padding-inline:24px;/);
    expect(responsiveShellCss).toMatch(/\.launch-content \{[\s\S]*width:min\(100%,1120px\);[\s\S]*padding-inline:24px;/);
  });

  it("lets the three provider controls use the full launch content width", () => {
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .launch-home .guest-app-auth-strip');
    expect(responsiveShellCss).toMatch(/\.launch-home \.guest-app-auth-strip \{[\s\S]*width:100%;[\s\S]*margin-inline:0 !important;/);
  });

  it("keeps desktop preview headings on a stable two-column row", () => {
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .launch-home .launch-preview-heading');
    expect(responsiveShellCss).toContain("grid-template-columns:minmax(0,1fr) auto;");
    expect(responsiveShellCss).toContain("column-gap:24px;");
    expect(responsiveShellCss).toContain("text-align:right;");
  });
});
