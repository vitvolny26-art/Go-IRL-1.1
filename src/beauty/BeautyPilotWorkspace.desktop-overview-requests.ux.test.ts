import { describe, expect, it } from "vitest";
import workspaceSource from "./BeautyPilotWorkspace.tsx?raw";
import { readFileSync } from "node:fs";

const desktopCss = readFileSync(new URL("./beauty-workspace-desktop.css", import.meta.url), "utf8");

describe("GROOMING002-D desktop overview and requests layout", () => {
  it("uses a dense overview dashboard and desktop requests split view", () => {
    expect(workspaceSource).toContain("beauty-workspace-overview-grid");
    expect(workspaceSource).toContain("beauty-workspace-requests-grid");
    expect(workspaceSource).toContain("beauty-workspace-request-detail");
    expect(workspaceSource).toContain('view !== "requests"');
    expect(desktopCss).toContain("grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr)");
    expect(desktopCss).toContain("grid-template-columns: minmax(360px, 0.95fr) minmax(360px, 1.05fr)");
    expect(desktopCss).toContain("position: sticky");
  });
});
