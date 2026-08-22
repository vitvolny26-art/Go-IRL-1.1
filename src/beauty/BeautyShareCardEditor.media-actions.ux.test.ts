import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import editorSource from "./BeautyShareCardEditor.tsx?raw";

const editorCss = readFileSync(new URL("./beauty-share-card-editor.css", import.meta.url), "utf8");

describe("GROOMING002-G business-card media actions", () => {
  it("places the background and logo upload actions below the preview before the controls", () => {
    const previewIndex = editorSource.indexOf('<div className="beauty-share-card-preview"');
    const mediaActionsIndex = editorSource.indexOf('beauty-share-card-upload-row beauty-share-card-media-actions');
    const controlsIndex = editorSource.indexOf('<div className="beauty-share-card-controls">');

    expect(previewIndex).toBeGreaterThan(-1);
    expect(mediaActionsIndex).toBeGreaterThan(previewIndex);
    expect(controlsIndex).toBeGreaterThan(mediaActionsIndex);
    expect(editorSource.match(/text\.uploadBackground/g)).toHaveLength(1);
    expect(editorSource.match(/text\.uploadLogo/g)).toHaveLength(1);
    expect(editorSource).toContain('upload(event.target.files?.[0], "background")');
    expect(editorSource).toContain('upload(event.target.files?.[0], "logo")');
  });

  it("keeps the two media upload actions on one desktop row with a mobile-safe stack", () => {
    expect(editorCss).toContain('.beauty-share-card-preview-column');
    expect(editorCss).toContain('.beauty-share-card-upload-row.beauty-share-card-media-actions');
    expect(editorCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(editorCss).toContain('max-width: 600px;');
    expect(editorCss).toContain('@media (max-width: 480px)');
    expect(editorCss).toContain('.beauty-share-card-upload-row.beauty-share-card-media-actions { grid-template-columns: 1fr; }');
  });
});
