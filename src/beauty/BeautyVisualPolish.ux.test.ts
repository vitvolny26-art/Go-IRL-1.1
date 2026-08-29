import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profileCss = readFileSync(new URL("./beauty-professional-profile.css", import.meta.url), "utf8");
const shareCardSvgSource = readFileSync(new URL("../../api/_shared/beauty-share-card-svg.ts", import.meta.url), "utf8");
const shareCardModelSource = readFileSync(new URL("./beautyShareCardModel.ts", import.meta.url), "utf8");

describe("WEB001 Beauty profile and share-card visual polish", () => {
  it("keeps the desktop professional portrait compact, left aligned, and horizontally contained", () => {
    expect(profileCss).toContain('html[data-go-irl-client="web"] .beauty-pro-profile-intro{overflow-x:hidden!important}');
    expect(profileCss).toContain("width:180px!important;");
    expect(profileCss).toContain("max-width:180px!important;");
    expect(profileCss).toContain("margin:18px 0 0!important;");
  });

  it("removes the About heading sparkle without hiding the other profile icons", () => {
    expect(profileCss).toContain(".beauty-pro-profile-about .beauty-pro-profile-heading>svg{display:none!important}");
  });

  it("gives browser and share SVG rendering a local calligraphic font source", () => {
    expect(profileCss).toContain('font-family:"GO IRL Beauty Script Web";');
    expect(profileCss).toContain('local("Segoe Script")');
    expect(shareCardSvgSource).toContain('@font-face{font-family:"GO IRL Beauty Script Web"');
    expect(shareCardSvgSource).toContain('local("Segoe Script")');
    expect(shareCardSvgSource).toContain('font-family="GO IRL Beauty Script Web, GO IRL Beauty Script, Great Vibes, cursive"');
  });

  it("invalidates already generated cards after the typography contract changes", () => {
    expect(shareCardModelSource).toContain("version: 6");
  });
});
