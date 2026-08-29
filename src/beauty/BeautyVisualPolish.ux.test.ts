import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profileCss = readFileSync(new URL("./beauty-professional-profile.css", import.meta.url), "utf8");
const shareCardSvgSource = readFileSync(new URL("../../api/_shared/beauty-share-card-svg.ts", import.meta.url), "utf8");
const shareCardModelSource = readFileSync(new URL("./beautyShareCardModel.ts", import.meta.url), "utf8");
const shareCardEditorSource = readFileSync(new URL("./BeautyShareCardEditor.tsx", import.meta.url), "utf8");
const masterWorkspaceSource = readFileSync(new URL("./BeautyMasterWorkspacePage.tsx", import.meta.url), "utf8");
const shareCardTitleCanvasSource = readFileSync(new URL("./beautyShareTitleCanvas.ts", import.meta.url), "utf8");
const shareCardSocialAssetsSource = readFileSync(new URL("./beautySocialShareAssets.ts", import.meta.url), "utf8");
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

  it("renders the Business Card title in white and bounds client raster waits", () => {
    expect(masterWorkspaceSource).toContain('const BeautyShareCardEditor = lazy(() => import("./BeautyShareCardEditor")');
    expect(masterWorkspaceSource).not.toContain('import { BeautyShareCardEditor } from "./BeautyShareCardEditor";');
    expect(masterWorkspaceSource).toContain("<Suspense fallback=");
    expect(shareCardEditorSource).toContain('await import("./beautyShareTitleCanvas")');
    expect(shareCardTitleCanvasSource).toContain("const beautyShareTitleFontTimeoutMs = 4_000;");
    expect(shareCardTitleCanvasSource).toContain("new AbortController()");
    expect(shareCardTitleCanvasSource).toContain("controller.abort()");
    expect(shareCardTitleCanvasSource).toContain("signal: controller.signal");
    expect(shareCardTitleCanvasSource).toContain("return null;");
    expect(shareCardTitleCanvasSource).toContain('"GO IRL Beauty Script Web", "Great Vibes", cursive');
    expect(shareCardTitleCanvasSource).toContain('context.font = `400 ${fontSize}px ${beautyShareTitleFontFamily}, ${beautyShareTitleFontFallback}`');
    expect(shareCardTitleCanvasSource).toContain('context.fillStyle = "#fff";');
    expect(shareCardTitleCanvasSource).not.toContain("context.fillStyle = gradient;");
    expect(shareCardSvgSource).toContain('data-beauty-premium-title="true" x="80" y="150" fill="#fff"');
    expect(shareCardEditorSource).toContain("const beautyShareImageTimeoutMs = 4_000;");
    expect(shareCardEditorSource).toContain("beauty_share_image_load_timeout");
    expect(shareCardSocialAssetsSource).toContain("const beautySocialImageTimeoutMs = 4_000;");
    expect(shareCardSocialAssetsSource).toContain("beauty_social_image_load_timeout");
    expect(shareCardEditorSource).toContain('buildBeautyShareCardPreviewSvg(workspace, language).replace(beautyShareTitlePattern, "")');
  });

  it("invalidates already generated cards after the white-title contract changes", () => {
    expect(shareCardModelSource).toContain("version: 9");
  });
});
