import { describe, expect, it } from "vitest";
import workspaceSource from "./BeautyPilotWorkspace.tsx?raw";
import { readFileSync } from "node:fs";

const desktopCss = readFileSync(new URL("./beauty-workspace-desktop.css", import.meta.url), "utf8");

describe("GROOMING002-F desktop business-card layout", () => {
  it("integrates the existing share-card editor as a desktop master-workspace surface", () => {
    expect(workspaceSource).toContain("beauty-workspace-business-card-view");
    expect(workspaceSource).toContain("beauty-workspace-business-card-editor");
    expect(desktopCss).toContain(".beauty-workspace-shell .beauty-workspace-business-card-editor .beauty-share-card-heading");
    expect(desktopCss).toContain("grid-template-columns: minmax(420px, 0.95fr) minmax(360px, 1.05fr)");
    expect(desktopCss).toContain("width: min(100%, 520px)");
    expect(desktopCss).toContain("background: rgba(18, 13, 26, 0.52)");
  });

  it("keeps the desktop integration presentation-only", () => {
    expect(desktopCss).toContain("display: none");
    expect(desktopCss).toContain("position: sticky");
    expect(workspaceSource).toContain("businessCardEditor");
    expect(workspaceSource).not.toContain("renderBeautyShareCard");
  });
});
