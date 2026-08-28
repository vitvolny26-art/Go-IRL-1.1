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

  it("keeps booking confirmation inside appointments but below the primary calendar", () => {
    expect(pageSource).not.toContain("BeautyBookingConfirmationModeControl");
    expect(pilotSource.match(/<BeautyBookingConfirmationModeControl/g)?.length).toBe(1);
    expect(pilotSource).toContain('const appointments = <section className="beauty-workspace-view beauty-workspace-appointments-view">');
    const calendarIndex = pilotSource.indexOf('className="beauty-workspace-subsection beauty-workspace-calendar-primary"');
    const confirmationIndex = pilotSource.indexOf("<BeautyBookingConfirmationModeControl language={language} />");
    const syncNoticeIndex = pilotSource.indexOf("{bookingSyncNotice}", confirmationIndex);
    expect(calendarIndex).toBeGreaterThan(-1);
    expect(confirmationIndex).toBeGreaterThan(calendarIndex);
    expect(syncNoticeIndex).toBeGreaterThan(confirmationIndex);
  });

  it("keeps the Activity / Services domain rail in the desktop workspace", () => {
    expect(pageSource).toContain('className="beauty-domain-rail"');
    expect(pageSource).toContain('window.location.assign("/activities")');
    expect(pageSource).toContain('window.location.assign("/services")');
    expect(pageSource).toContain('aria-current="page"');
    expect(desktopSource).toContain('.beauty-domain-rail {');
    expect(desktopSource).toContain('grid-template-columns: 56px minmax(0, 1fr);');
    expect(desktopSource).toContain('html[data-go-irl-client="web"] .beauty-workspace-shell .beauty-domain-rail');
  });
});