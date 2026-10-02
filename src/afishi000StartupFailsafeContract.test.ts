import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main.tsx"), "utf8");

describe("AFISHI000 startup fail-safe contract", () => {
  it("isolates optional pre-render enhancements from the root render path", () => {
    expect(mainSource).toContain("const runStartupEnhancement =");
    expect(mainSource).toContain("try {");
    expect(mainSource).toContain("enhancement();");
    expect(mainSource).toContain("catch (error)");
    expect(mainSource).toContain('runStartupEnhancement("full-create-taxonomy", enableFullCreateTaxonomy)');
    expect(mainSource).toContain('runStartupEnhancement("mapy-runtime-links", enableMapyRuntimeLinks)');
    expect(mainSource).toContain('runStartupEnhancement("unified-event-primary-controls", enableUnifiedEventPrimaryControls)');
  });

  it("keeps the React root render after optional startup enhancements", () => {
    const enhancementIndex = mainSource.indexOf('runStartupEnhancement("unified-event-primary-controls"');
    const renderIndex = mainSource.indexOf('createRoot(document.getElementById("root")!).render(');
    expect(enhancementIndex).toBeGreaterThan(-1);
    expect(renderIndex).toBeGreaterThan(enhancementIndex);
  });

  it("also isolates post-render DOM enhancements", () => {
    expect(mainSource).toContain('runStartupEnhancement("activity-3d-icons", enableActivity3dIcons)');
    expect(mainSource).toContain('runStartupEnhancement("create-icon-selects", enableCreateIconSelects)');
  });
});
