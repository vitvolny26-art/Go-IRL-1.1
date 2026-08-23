import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import editorSource from "./BeautyShareCardEditor.tsx?raw";

const editorCss = readFileSync(new URL("./beauty-share-card-editor.css", import.meta.url), "utf8");

describe("GROOMING002-G business-card media actions", () => {
  it("places the background and logo media panels below the preview before the controls", () => {
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

  it("maximizes background controls while making the logo panel minimal and titleless", () => {
    expect(editorCss).toContain('.beauty-share-card-preview-column');
    expect(editorCss).toContain('.beauty-share-card-upload-row.beauty-share-card-media-actions');
    expect(editorCss).toContain('grid-template-columns: minmax(0, 1fr) minmax(108px, 118px);');
    expect(editorCss).toContain('.beauty-share-card-media-actions > section:last-child h3 { display: none; }');
    expect(editorCss).toContain('.beauty-share-card-media-actions > section:last-child .beauty-share-card-upload-row');
    expect(editorCss).toContain('font-size: 11px;');
    expect(editorCss).toContain('.beauty-share-card-media-actions > section:first-child .beauty-share-card-range');
    expect(editorCss).toContain('grid-template-columns: auto minmax(0, 1fr);');
    expect(editorCss).toContain('max-width: 600px;');
    expect(editorCss).toContain('@media (max-width: 480px)');
    expect(editorCss).toContain('.beauty-share-card-upload-row.beauty-share-card-media-actions { grid-template-columns: 1fr; }');
  });

  it("forces download below update and keeps delete below both actions on desktop", () => {
    const updateIndex = editorSource.indexOf('<RefreshCw />{text.update}');
    const downloadIndex = editorSource.indexOf('<Download />{text.download}');
    const deleteIndex = editorSource.indexOf('<Trash2 />{text.remove}');

    expect(updateIndex).toBeGreaterThan(-1);
    expect(downloadIndex).toBeGreaterThan(updateIndex);
    expect(deleteIndex).toBeGreaterThan(downloadIndex);
    expect(editorCss).toContain('.beauty-share-card-actions { display: grid; grid-template-columns: minmax(0, 1fr) !important; gap: 8px; }');
    expect(editorCss).toContain('.beauty-share-card-actions > * { box-sizing: border-box; width: 100%; }');
  });
});
