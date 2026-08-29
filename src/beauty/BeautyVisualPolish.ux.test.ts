import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profileCss = readFileSync(new URL("./beauty-professional-profile.css", import.meta.url), "utf8");
const shareCardSvgSource = readFileSync(new URL("../../api/_shared/beauty-share-card-svg.ts", import.meta.url), "utf8");
const shareCardModelSource = readFileSync(new URL("./beautyShareCardModel.ts", import.meta.url), "utf8");
const shareCardEditorSource = readFileSync(new URL("./BeautyShareCardEditor.tsx", import.meta.url), "utf8");
const professionalPhotoSource = readFileSync(new URL("./beautyProfessionalPhoto.ts", import.meta.url), "utf8");
const professionalPhotoSquareCss = readFileSync(new URL("./beauty-professional-photo-square.css", import.meta.url), "utf8");
const avatarCropperSource = readFileSync(new URL("../avatarCropper.ts", import.meta.url), "utf8");
const avatarCropperCss = readFileSync(new URL("../avatar-cropper.css", import.meta.url), "utf8");

describe("WEB001 Beauty profile and share-card visual polish", () => {
  it("keeps the desktop professional photo square and 50 percent larger", () => {
    expect(profileCss).toContain('html[data-go-irl-client="web"] .beauty-pro-profile-intro{overflow-x:hidden!important}');
    expect(professionalPhotoSquareCss).toContain("width: 270px !important;");
    expect(professionalPhotoSquareCss).toContain("max-width: 270px !important;");
    expect(professionalPhotoSquareCss).toContain("aspect-ratio: 1 / 1 !important;");
    expect(professionalPhotoSquareCss).toContain("object-fit: cover;");
  });

  it("crops professional-photo uploads to a square before the existing upload handler runs", () => {
    expect(professionalPhotoSource).toContain('input.closest(".beauty-workspace-professional-photo")');
    expect(professionalPhotoSource).toContain('import("../avatarCropper")');
    expect(professionalPhotoSource).toContain('previewShape: "square"');
    expect(professionalPhotoSource).toContain("outputSize: 1024");
    expect(professionalPhotoSource).toContain('input.dispatchEvent(new Event("change", { bubbles: true }))');
    expect(avatarCropperSource).toContain('previewShape?: "circle" | "square"');
    expect(avatarCropperCss).toContain(".avatar-cropper-preview--square");
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

  it("rasterizes the Business Card title with the same web font used by Catalog and For You", () => {
    expect(shareCardEditorSource).toContain('document.fonts.load(`400 ${fontSize}px "GO IRL Beauty Script Web"`, title)');
    expect(shareCardEditorSource).toContain('context.font = `400 ${fontSize}px ${beautyShareTitleFontFamily}`');
    expect(shareCardEditorSource).toContain('buildBeautyShareCardPreviewSvg(workspace, language).replace(beautyShareTitlePattern, "")');
  });

  it("invalidates already generated cards after the typography contract changes", () => {
    expect(shareCardModelSource).toContain("version: 7");
  });
});
