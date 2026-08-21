import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import pageSource from "./BeautyMasterWorkspacePage.tsx?raw";
import pilotSource from "./BeautyPilotWorkspace.tsx?raw";
import dialogSource from "./BeautyWorkspaceSettingsDialog.tsx?raw";

const desktopSource = readFileSync(new URL("./beauty-workspace-desktop.css", import.meta.url), "utf8");

describe("Beauty master inline settings", () => {
  it("does not navigate the master workspace to the legacy Beauty setup route", () => {
    expect(pageSource).toContain("setSettingsOpen(true)");
    expect(pageSource).toContain("BeautyWorkspaceSettingsDialog");
    expect(pageSource).not.toContain('window.location.assign("/beauty")');
  });

  it("keeps profile, service and recurring availability controls in the workspace dialog", () => {
    expect(dialogSource).toContain("Профиль, услуга и расписание меняются здесь");
    expect(dialogSource).toContain("beauty-weekdays");
    expect(dialogSource).toContain("breakEnabled");
    expect(dialogSource).toContain("saveBeautyWorkspace(workspace)");
  });

  it("keeps desktop overrides after mobile navigation styles and localizes icon labels", () => {
    const mobileImport = 'import "./beauty-master-mobile-nav.css";';
    const desktopImport = 'import "./beauty-workspace-desktop.css";';
    expect(pageSource).toContain(mobileImport);
    expect(pageSource).toContain(desktopImport);
    expect(pageSource.indexOf(desktopImport)).toBeGreaterThan(pageSource.indexOf(mobileImport));
    expect(pilotSource).not.toContain(desktopImport);
    expect(pageSource).toContain("aria-label={accessibilityCopy[language].back}");
    expect(pageSource).toContain("aria-label={accessibilityCopy[language].settings}");
    for (const label of ["Назад", "Основные настройки", "Основні налаштування", "Zpět", "Hlavní nastavení", "Back", "Main settings"]) {
      expect(pageSource).toContain(label);
    }
  });
  it("uses a dedicated wide desktop settings dialog without horizontal overflow", () => {
    expect(dialogSource).toContain('className="beauty-dialog beauty-workspace-settings-dialog"');
    expect(desktopSource).toContain(".beauty-workspace-settings-dialog");
    expect(desktopSource).toContain("width: min(920px, calc(100vw - 64px));");
    expect(desktopSource).toContain("overflow-x: hidden;");
    expect(desktopSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(desktopSource).toContain("width: 100%;");
    expect(desktopSource).toContain("min-width: 0;");
  });

});
