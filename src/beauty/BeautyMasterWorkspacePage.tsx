import { ArrowLeft, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "../store";
import type { Language } from "../types";
import { BeautyBookingConfirmationModeControl } from "./BeautyBookingConfirmationModeControl";
import { BeautyPilotWorkspace } from "./BeautyPilotWorkspace";
import { BeautyShareCardEditor } from "./BeautyShareCardEditor";
import { BeautyWorkspaceContentEditor } from "./BeautyWorkspaceContentEditor";
import { BeautyWorkspaceSettingsDialog } from "./BeautyWorkspaceSettingsDialog";
import { createDefaultBeautyWorkspace, type BeautyWorkspace } from "./beautySetupModel";
import { resolveBeautySpecializationPresentation } from "./beautySpecializationPresentation";
import { loadBeautyWorkspace, saveBeautyWorkspace } from "./beautyWorkspaceStorage";
import { canShowBeautyWorkspaceEntry } from "./servicesRoleNavigation";
import "./beauty-setup.css";
import "./beauty-multilingual-editor.css";
import "./beauty-master-mobile-nav.css";
import "./beauty-workspace-desktop.css";

const loadingCopy: Record<Language, string> = {
  ru: "Загружаем кабинет…",
  uk: "Завантажуємо кабінет…",
  cs: "Načítáme kabinet…",
  en: "Loading workspace…",
};

const accessibilityCopy: Record<Language, { back: string; settings: string }> = {
  ru: { back: "Назад", settings: "Основные настройки" },
  uk: { back: "Назад", settings: "Основні налаштування" },
  cs: { back: "Zpět", settings: "Hlavní nastavení" },
  en: { back: "Back", settings: "Main settings" },
};

export function BeautyMasterWorkspacePage() {
  const language = useAppStore((state) => state.language);
  const userRole = useAppStore((state) => state.userRole);
  const [workspace, setWorkspace] = useState<BeautyWorkspace>(() => createDefaultBeautyWorkspace(language));
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void loadBeautyWorkspace(language)
      .then((loaded) => { if (active) setWorkspace(loaded); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [language]);

  useEffect(() => {
    if (loading) return;
    void saveBeautyWorkspace(workspace);
  }, [loading, workspace]);

  useEffect(() => {
    const app = document.querySelector<HTMLElement>("#root > .app, #root .app");
    if (!app) return undefined;
    const previous = app.style.display;
    app.style.display = "none";
    return () => { app.style.display = previous; };
  }, []);

  if (!canShowBeautyWorkspaceEntry(userRole)) return null;
  if (loading) return <main className="beauty-shell beauty-workspace-shell"><div className="beauty-loading">{loadingCopy[language]}</div></main>;

  const presentation = resolveBeautySpecializationPresentation(workspace);
  const changeWorkspace = (next: BeautyWorkspace) => setWorkspace(next);
  const openSettings = () => setSettingsOpen(true);

  return <main className="beauty-shell beauty-workspace-shell" data-service-specialization={presentation.specialization} data-beauty-master-route="/services/beauty/master">
    <header className="beauty-topbar">
      <button className="beauty-icon-button" type="button" onClick={() => window.location.assign("/services")} aria-label={accessibilityCopy[language].back}><ArrowLeft /></button>
      <div><span>GO IRL · Services / Grooming / {presentation.publicLabel} / Master</span><h1>{presentation.workspaceTitle[language]}</h1></div>
      <button className="beauty-icon-button" type="button" onClick={openSettings} aria-label={accessibilityCopy[language].settings}><Settings2 /></button>
    </header>
    <section className="beauty-workspace-page">
      <BeautyBookingConfirmationModeControl language={language} />
      <BeautyPilotWorkspace
        setup={workspace}
        onEdit={openSettings}
        pageEditor={<BeautyWorkspaceContentEditor workspace={workspace} language={language} onChange={changeWorkspace} />}
        businessCardEditor={<BeautyShareCardEditor workspace={workspace} language={language} onChange={changeWorkspace} />}
      />
    </section>
    {settingsOpen && <BeautyWorkspaceSettingsDialog
      workspace={workspace}
      language={language}
      onChange={changeWorkspace}
      onClose={() => setSettingsOpen(false)}
    />}
  </main>;
}
