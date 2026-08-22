import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import pageSource from "./BeautyMasterWorkspacePage.tsx?raw";
import pilotSource from "./BeautyPilotWorkspace.tsx?raw";
import headerSource from "../components/AppHeader.tsx?raw";

const desktopSource = readFileSync(new URL("./beauty-workspace-desktop.css", import.meta.url), "utf8");

describe("Beauty workspace standard header", () => {
  it("uses the shared GO IRL header with Beauty profession controls", () => {
    expect(pageSource).toContain("<AppHeader");
    expect(pageSource).toContain("beauty-header-controls");
    expect(headerSource).toContain("extraControls?: ReactNode");
    expect(headerSource).toContain("{extraControls}");
    expect(pageSource).not.toContain("beauty-workspace-topbar");
    expect(pageSource).not.toContain("beauty-language-picker");
    expect(pageSource).not.toContain("beauty-header-close");
    expect(pageSource).not.toContain("<X />");
  });

  it("offsets the desktop workspace by the canonical app header height", () => {
    expect(headerSource).toContain('root.style.setProperty("--app-header-height", "84px")');
    expect(desktopSource).toContain("margin-top: var(--app-header-height, 84px);");
    expect(desktopSource).toContain("min-height: calc(100dvh - var(--app-header-height, 84px));");
    expect(desktopSource).toContain("min-height: calc(100dvh - var(--app-header-height, 84px) - 48px);");
  });

  it("shows booking confirmation mode only inside appointments", () => {
    expect(pageSource).not.toContain("BeautyBookingConfirmationModeControl");
    expect(pilotSource).toContain('const appointments = <section className="beauty-workspace-view">\n    <BeautyBookingConfirmationModeControl language={language} />');
    expect(pilotSource.match(/<BeautyBookingConfirmationModeControl/g)?.length).toBe(1);
  });
});
