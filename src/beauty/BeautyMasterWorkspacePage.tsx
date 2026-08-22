import { Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "../store";
import type { Language } from "../types";
import { BeautyBookingConfirmationModeControl } from "./BeautyBookingConfirmationModeControl";
import { BeautyPilotWorkspace } from "./BeautyPilotWorkspace";
import { BeautyShareCardEditor } from "./BeautyShareCardEditor";
import { BeautyWorkspaceContentEditor } from "./BeautyWorkspaceContentEditor";
import { BeautyWorkspaceSettingsDialog } from "./BeautyWorkspaceSettingsDialog";
import { createDefaultBeautyWorkspace, type BeautyServiceSpecialization, type BeautyWorkspace } from "./beautySetupModel";
import { applyBeautyProfession, beautyProfessionIds, beautyProfessionRegistry, resolveBeautyProfessionId } from "./beautyProfessionRegistry";
import { resolveBeautySpecializationPresentation } from "./beautySpecializationPresentation";
import { loadBeautyWorkspace, saveBeautyWorkspace, saveBeautyWorkspaceProfile } from "./beautyWorkspaceStorage";
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

const accessibilityCopy: Record<Language, { close: string; settings: string }> = {
  ru: { close: "Закрыть кабинет", settings: "Основные настройки" },
  uk: { close: "Закрити кабінет", settings: "Основні налаштування" },
  cs: { close: "Zavřít kabinet", settings: "Hlavní nastavení" },
  en: { close: "Close workspace", settings: "Main settings" },
};

const professionCopy: Record<Language, { label: string; hint: string }> = {
  ru: { label: "Профессия", hint: "Определяет кабинет, услуги и оформление" },
  uk: { label: "Професія", hint: "Визначає кабінет, послуги й оформлення" },
  cs: { label: "Profese", hint: "Určuje kabinet, služby a vzhled" },
  en: { label: "Profession", hint: "Controls workspace, services and artwork" },
};

const publicationCopy: Record<Language, { publish: string; unpublish: string; publishing: string; unpublishing: string; error: string }> = {
  ru: { publish: "Опубликовать", unpublish: "Снять с публикации", publishing: "Публикуем…", unpublishing: "Снимаем…", error: "Не удалось изменить публикацию." },
  uk: { publish: "Опублікувати", unpublish: "Зняти з публікації", publishing: "Публікуємо…", unpublishing: "Знімаємо…", error: "Не вдалося змінити публікацію." },
  cs: { publish: "Publikovat", unpublish: "Zrušit publikování", publishing: "Publikujeme…", unpublishing: "Rušíme publikování…", error: "Publikaci se nepodařilo změnit." },
  en: { publish: "Publish", unpublish: "Unpublish", publishing: "Publishing…", unpublishing: "Unpublishing…", error: "Could not change publication state." },
};

export function BeautyMasterWorkspacePage() {
  const language = useAppStore((state) => state.language);
  const userRole = useAppStore((state) => state.userRole);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const [workspace, setWorkspace] = useState<BeautyWorkspace>(() => createDefaultBeautyWorkspace(language));
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationError, setPublicationError] = useState("");

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
  const professionId = resolveBeautyProfessionId(workspace);
  const changeWorkspace = (next: BeautyWorkspace) => setWorkspace(next);
  const changeProfession = (profession: BeautyServiceSpecialization) => changeWorkspace(applyBeautyProfession(workspace, profession));
  const openSettings = () => setSettingsOpen(true);
  const togglePublication = async () => {
    if (publicationBusy) return;
    const nextPublished = !workspace.published;
    const next: BeautyWorkspace = {
      ...workspace,
      published: nextPublished,
      currentStep: nextPublished ? "pro_setup_published" : "pro_workspace",
    };
    setPublicationBusy(true);
    setPublicationError("");
    try {
      await saveBeautyWorkspaceProfile(next);
      setWorkspace(next);
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : publicationCopy[language].error;
      setPublicationError(reason);
    } finally {
      setPublicationBusy(false);
    }
  };

  return <main className="beauty-shell beauty-workspace-shell" data-service-specialization={presentation.specialization} data-beauty-master-route="/services/beauty/master">
    <header className="beauty-topbar beauty-workspace-topbar">
      <div className="beauty-profession-picker" role="group" aria-label={professionCopy[language].label}>
        <span className="beauty-profession-label">{professionCopy[language].label}</span>
        <div className="beauty-profession-options">{beautyProfessionIds.map((profession) => {
          const definition = beautyProfessionRegistry[profession];
          return <button key={profession} className={professionId === profession ? "is-active" : ""} type="button" onClick={() => changeProfession(profession)} aria-pressed={professionId === profession}><img src={definition.defaultIcon} alt="" /> <span>{definition.publicLabel}</span></button>;
        })}</div>
        <small>{professionCopy[language].hint}</small>
      </div>
      <div className="beauty-workspace-top-actions">
        <div className="beauty-language-picker" role="group" aria-label="Language">{(["ru", "uk", "cs", "en"] as Language[]).map((item) => <button key={item} className={language === item ? "is-active" : ""} type="button" onClick={() => setLanguage(item)} aria-pressed={language === item}>{item.toUpperCase()}</button>)}</div>
        <button className="beauty-icon-button" type="button" onClick={openSettings} aria-label={accessibilityCopy[language].settings}><Settings2 /></button>
        <button className="beauty-icon-button beauty-workspace-close" type="button" onClick={() => window.location.assign("/services")} aria-label={accessibilityCopy[language].close}><X /></button>
      </div>
    </header>
    <section className="beauty-workspace-page">
      <BeautyBookingConfirmationModeControl language={language} />
      <BeautyPilotWorkspace
        setup={workspace}
        onEdit={openSettings}
        onPublicationToggle={() => { void togglePublication(); }}
        publicationBusy={publicationBusy}
        publicationError={publicationError}
        publicationActionLabel={publicationBusy
          ? (workspace.published ? publicationCopy[language].unpublishing : publicationCopy[language].publishing)
          : (workspace.published ? publicationCopy[language].unpublish : publicationCopy[language].publish)}
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
