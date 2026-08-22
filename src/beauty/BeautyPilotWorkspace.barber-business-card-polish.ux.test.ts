import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import editorSource from "./BeautyShareCardEditor.tsx?raw";

const barberCss = readFileSync(new URL("./beauty-barber-residual-ui.css", import.meta.url), "utf8");

describe("GROOMING002-G Barber business-card desktop polish", () => {
  it("keeps the Barber mid-desktop preview compact and aligned to the canonical 1080x900 ratio", () => {
    expect(barberCss).toContain('@media (min-width: 980px)');
    expect(barberCss).toContain('grid-template-columns: minmax(300px, 0.72fr) minmax(0, 1.28fr)');
    expect(barberCss).toContain('width: min(100%, 400px)');
    expect(barberCss).toContain('max-width: 400px');
    expect(barberCss).toContain('aspect-ratio: 6 / 5');
    expect(editorSource).toContain('canvas.width = 1080');
    expect(editorSource).toContain('canvas.height = 900');
  });

  it("uses the Barber navy and gold palette without applying that control palette to Nails", () => {
    expect(barberCss).toContain('.beauty-workspace-shell[data-service-specialization="barber"] .beauty-workspace-business-card-editor .beauty-share-card-controls');
    expect(barberCss).toContain('background: linear-gradient(180deg, #07182b 0%, #03101e 100%)');
    expect(barberCss).toContain('background: #0b2036');
    expect(barberCss).toContain('border-color: #d4af37');
    expect(barberCss).toContain('background: #d4af37');
    expect(barberCss).not.toContain('[data-service-specialization="nails"] .beauty-workspace-business-card-editor .beauty-share-card-controls');
  });

  it("enlarges only the wide-desktop preview to 600px for both Barber and Nails", () => {
    expect(barberCss).toContain('@media (min-width: 1280px)');
    expect(barberCss).toContain('.beauty-workspace-shell[data-service-specialization="barber"] .beauty-workspace-business-card-editor .beauty-share-card-layout');
    expect(barberCss).toContain('.beauty-workspace-shell[data-service-specialization="nails"] .beauty-workspace-business-card-editor .beauty-share-card-layout');
    expect(barberCss).toContain('grid-template-columns: minmax(520px, 1.2fr) minmax(320px, 0.8fr)');
    expect(barberCss).toContain('width: min(100%, 600px)');
    expect(barberCss).toContain('max-width: 600px');
  });
});
