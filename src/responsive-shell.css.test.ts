import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const responsiveShellCss = readFileSync(new URL("./responsive-shell.css", import.meta.url), "utf8");
const professionalProfileSource = readFileSync(new URL("./beauty/BeautyProfessionalProfilePortal.tsx", import.meta.url), "utf8");
const professionalProfileOverridesCss = readFileSync(new URL("./beauty/beauty-professional-profile-overrides.css", import.meta.url), "utf8");

describe("WEB001-D3-R1 desktop Activities density", () => {
  it("uses two columns for For You and three columns for Catalog", () => {
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .activity-stack {\n    grid-template-columns: repeat(3,minmax(0,1fr));\n    gap: 16px;`);
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .discover-page .horizontal-events {\n    display: grid;\n    grid-template-columns: repeat(2,minmax(0,480px));\n    gap: 16px;\n    justify-content: start;`);
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

describe("WEB001-D3-R1 desktop Services density", () => {
  it("reserves a three-square-card row on Services Home without adding placeholders", () => {
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .category-grid.module-grid.services-category-grid');
    expect(responsiveShellCss).toContain("grid-template-columns: repeat(3,minmax(0,1fr));");
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .category-grid.module-grid.services-category-grid .category-button');
  });

  it("uses two columns for For You and three columns for Catalog", () => {
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .services-professional-grid {\n    display: grid;\n    grid-template-columns: repeat(2,minmax(0,1fr));\n    gap: 16px;`);
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .services-for-you-view .services-professional-grid {\n    grid-template-columns: repeat(2,minmax(0,480px));\n    justify-content: start;\n  }`);
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .services-catalog-view .services-professional-grid {\n    grid-template-columns: repeat(3,minmax(0,1fr));`);
  });

  it("matches the Services For You card height to the Activities For You contract", () => {
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .services-for-you-view .service-activity-card {\n    min-height: clamp(470px,132vw,585px);\n  }`);
  });

  it("keeps the opened professional detail in a desktop-only two-column shell", () => {
    expect(professionalProfileSource).toContain('className="beauty-pro-profile-intro"');
    expect(professionalProfileSource).toContain('className="beauty-pro-profile-content"');
    expect(responsiveShellCss).toContain("grid-template-columns: max(318px,calc(41% - 3cm)) minmax(0,1fr);");
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .beauty-pro-profile-shell:not(.beauty-pro-profile-state)');
  });

  it("moves the reserved professional photo under the desktop address instead of keeping it in the work rail", () => {
    const locationIndex = professionalProfileSource.indexOf("{professional.publicLocation}</button>");
    const photoIndex = professionalProfileSource.indexOf('className="beauty-pro-profile-professional-photo"');

    expect(professionalProfileSource).toContain("beautyProfessionalPhotoPortfolioId");
    expect(locationIndex).toBeGreaterThan(-1);
    expect(photoIndex).toBeGreaterThan(locationIndex);
    expect(professionalProfileSource).toContain('"beauty-pro-profile-portfolio-professional-photo"');
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .beauty-pro-profile-hero-copy .beauty-pro-profile-professional-photo');
    expect(responsiveShellCss).toContain('html[data-go-irl-client="web"] .beauty-pro-profile-portfolio-rail .beauty-pro-profile-portfolio-professional-photo');
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

describe("WEB001-D5 desktop LaunchPage header/auth alignment", () => {
  it("shares the desktop LaunchPage content boundary with the header and auth strip", () => {
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .header-inner {
    width: min(100%, 1120px);
    margin: 0 auto;
    padding-inline: 24px;
  }`);
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .guest-app-auth-strip {
    width: 100%;
  }`);
  });

  it("keeps preview heading copy in a stable desktop row", () => {
    expect(responsiveShellCss).toContain("grid-template-columns: minmax(0,1fr) auto;");
    expect(responsiveShellCss).toContain("align-items: baseline;");
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .launch-preview-heading small{
    text-align: right;`);
  });
});

describe("WEB001-D6-R1 desktop Root/Home preview typography", () => {
  it("keeps four preview columns and a 16px gap only in the desktop web scope", () => {
    expect(responsiveShellCss).toContain(`/* WEB001-D6: use the desktop LaunchPage width for denser Root/Home previews only. */\n@media (min-width: 960px) {`);
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .launch-preview-grid {\n    grid-template-columns: repeat(4,minmax(0,1fr));\n    gap: 16px;`);
  });

  it("enlarges desktop preview typography without changing the mobile LaunchPage rules", () => {
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .launch-preview-card {\n    min-height: 150px;\n    padding: 16px;`);
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .launch-preview-card strong {\n    font-size: 18px;`);
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .launch-preview-card span,\n  html[data-go-irl-client="web"] .launch-preview-card small {\n    font-size: 14px;`);
    expect(responsiveShellCss).toContain(`html[data-go-irl-client="web"] .launch-preview-card b {\n    font-size: 16px;`);
  });
});
