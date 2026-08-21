import { describe, expect, it } from "vitest";
import pageSource from "./BeautyMasterWorkspacePage.tsx?raw";
import pilotSource from "./BeautyPilotWorkspace.tsx?raw";
import dialogSource from "./BeautyWorkspaceSettingsDialog.tsx?raw";

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
});
