import { Save, Settings2, Sparkles, Zap } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { getTranslation } from "../i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAppStore } from "../store";
import type { Language } from "../types";
import { BeautyPilotWorkspace } from "./BeautyPilotWorkspace";
import { BeautyGoogleCalendarLifecycle } from "./BeautyGoogleCalendarSync";
import { BeautyWorkspaceContentEditor } from "./BeautyWorkspaceContentEditor";
import { BeautyWorkspaceSettingsDialog } from "./BeautyWorkspaceSettingsDialog";
import { createDefaultBeautyWorkspace, type BeautyServiceSpecialization, type BeautyWorkspace } from "./beautySetupModel";
import { applyBeautyProfession, beautyProfessionIds, beautyProfessionRegistry, resolveBeautyProfessionId } from "./beautyProfessionRegistry";
import { resolveBeautySpecializationPresentation } from "./beautySpecializationPresentation";
import { getBeautyShareCardGeneratedBatch } from "./beautyShareCardBatchCache";
import { buildBeautyShareCardFingerprint } from "./beautyShareCardModel";
import { clearBeautyWorkspaceDraft, hasBeautyWorkspaceDraft, loadBeautyWorkspace, saveBeautyWorkspace, saveBeautyWorkspaceDraft } from "./beautyWorkspaceStorage";
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

const accessibilityCopy: Record<Language, { settings: string }> = {
  ru: { settings: "Основные настройки" },
  uk: { settings: "Основні налаштування" },
  cs: { settings: "Hlavní nastavení" },
  en: { settings: "Main settings" },
};

const professionCopy: Record<Language, { label: string; hint: string }> = {
  ru: { label: "Профессия", hint: "Определяет кабинет, услуги и оформление" },
  uk: { label: "Професія", hint: "Визначає кабінет, послуги й оформлення" },
  cs: { label: "Profese", hint: "Určuje kabinet, služby a vzhled" },
  en: { label: "Profession", hint: "Controls workspace, services and artwork" },
};

const saveCopy: Record<Language, { save: string; saving: string; saved: string; error: string }> = {
  ru: { save: "Сохранить", saving: "Сохраняем…", saved: "Сохранено", error: "Не удалось сохранить изменения." },
  uk: { save: "Зберегти", saving: "Зберігаємо…", saved: "Збережено", error: "Не вдалося зберегти зміни." },
  cs: { save: "Uložit", saving: "Ukládáme…", saved: "Uloženo", error: "Změny se nepodařilo uložit." },
  en: { save: "Save", saving: "Saving…", saved: "Saved", error: "Could not save changes." },
};

const publicationCopy: Record<Language, { publish: string; unpublish: string; publishing: string; unpublishing: string; error: string }> = {
  ru: { publish: "Опубликовать", unpublish: "Снять с публикации", publishing: "Публикуем…", unpublishing: "Снимаем…", error: "Не удалось изменить публикацию." },
  uk: { publish: "Опублікувати", unpublish: "Зняти з публікації", publishing: "Публікуємо…", unpublishing: "Знімаємо публікацію…", error: "Не вдалося змінити публікацію." },
  cs: { publish: "Publikovat", unpublish: "Zrušit publikování", publishing: "Publikujeme…", unpublishing: "Rušíme publikování…", error: "Publikaci se nepodařilo změnit." },
  en: { publish: "Publish", unpublish: "Unpublish", publishing: "Publishing…", unpublishing: "Unpublishing…", error: "Could not change publication state." },
};

const BeautyShareCardEditor = lazy(() => import("./BeautyShareCardEditor").then((module) => ({ default: module.BeautyShareCardEditor })));
const BeautyShareCardController = lazy(() => import("./BeautyShareCardEditor").then((module) => ({ default: module.BeautyShareCardController })));

export function BeautyMasterWorkspacePage() {
  const language = useAppStore((state) => state.language);
  const userRole = useAppStore((state) => state.userRole);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const [workspace, setWorkspace] = useState<BeautyWorkspace>(() => createDefaultBeautyWorkspace(language));
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveDirty, setSaveDirty] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationError, setPublicationError] = useState("");
  const workspaceRevisionRef = useRef(0);
  const persistenceActionRef = useRef<"save" | "publication" | null>(null);

  useEffect(() => {
    let active = true;
    void loadBeautyWorkspace(language)
      .then(async (loaded) => {
        const dirty = await hasBeautyWorkspaceDraft();
        if (active) {
          setWorkspace(loaded);
          setSaveDirty(dirty);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [language]);

  useEffect(() => {
    if (loading || !saveDirty) return;
    void saveBeautyWorkspaceDraft(workspace).catch(() => undefined);
  }, [loading, saveDirty, workspace]);

  if (!canShowBeautyWorkspaceEntry(userRole)) return null;
  if (loading) return <main className="beauty-shell beauty-workspace-shell"><div className="beauty-loading">{loadingCopy[language]}</div></main>;

  const presentation = resolveBeautySpecializationPresentation(workspace);
  const translation = getTranslation(language);
  const professionId = resolveBeautyProfessionId(workspace);
  const shareCardFingerprint = buildBeautyShareCardFingerprint(workspace);
  const shareCardBatchReady = Boolean(getBeautyShareCardGeneratedBatch(shareCardFingerprint));
  const shareCardRenderPending = workspace.shareCard.enabled
    && workspace.shareCard.status !== "deleted"
    && !(
      workspace.shareCard.sourceFingerprint === shareCardFingerprint
      && Boolean(workspace.shareCard.generatedImageDataUrl)
      && (workspace.shareCard.status === "ready" || shareCardBatchReady)
    );

  const changeWorkspace = (next: BeautyWorkspace) => {
    workspaceRevisionRef.current += 1;
    setSaveDirty(true);
    setSaveError("");
    setPublicationError("");
    setWorkspace(next);
  };
  const reconcileWorkspace = (next: BeautyWorkspace, persistenceRequired = false) => {
    if (persistenceRequired) setSaveDirty(true);
    setWorkspace(next);
  };
  const changeProfession = (profession: BeautyServiceSpecialization) => changeWorkspace(applyBeautyProfession(workspace, profession));
  const openSettings = () => setSettingsOpen(true);
  const saveWorkspace = async () => {
    if (!saveDirty || shareCardRenderPending || persistenceActionRef.current) return;
    const snapshot = workspace;
    const revision = workspaceRevisionRef.current;
    persistenceActionRef.current = "save";
    setSaveBusy(true);
    setSaveError("");
    try {
      await saveBeautyWorkspace(snapshot);
      if (workspaceRevisionRef.current === revision) {
        await clearBeautyWorkspaceDraft();
        if (workspaceRevisionRef.current === revision) setSaveDirty(false);
      }
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : saveCopy[language].error;
      setSaveError(reason);
    } finally {
      persistenceActionRef.current = null;
      setSaveBusy(false);
    }
  };
  const togglePublication = async () => {
    if (shareCardRenderPending || persistenceActionRef.current) return;
    const nextPublished = !workspace.published;
    const next: BeautyWorkspace = {
      ...workspace,
      published: nextPublished,
      currentStep: nextPublished ? "pro_setup_published" : "pro_workspace",
    };
    const revision = workspaceRevisionRef.current;
    persistenceActionRef.current = "publication";
    setPublicationBusy(true);
    setPublicationError("");
    setSaveError("");
    try {
      await saveBeautyWorkspace(next);
      if (workspaceRevisionRef.current === revision) {
        await clearBeautyWorkspaceDraft();
        setWorkspace(next);
        if (workspaceRevisionRef.current === revision) setSaveDirty(false);
      } else {
        setWorkspace((current) => ({
          ...current,
          published: nextPublished,
          currentStep: nextPublished ? "pro_setup_published" : "pro_workspace",
        }));
      }
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : publicationCopy[language].error;
      setPublicationError(reason);
    } finally {
      persistenceActionRef.current = null;
      setPublicationBusy(false);
    }
  };
  const saveLabel = saveBusy ? saveCopy[language].saving : (saveDirty ? saveCopy[language].save : saveCopy[language].saved);

  return <>
    <BeautyGoogleCalendarLifecycle />
    <Suspense fallback={null}>
      <BeautyShareCardController workspace={workspace} language={language} onChange={reconcileWorkspace} />
    </Suspense>
    <AppHeader
      language={language}
      selectedCityId={useAppStore.getState().selectedCityId}
      translation={translation}
      onBrandClick={() => window.location.assign("/services")}
      onCityChange={useAppStore.getState().setSelectedCity}
      onLanguageChange={setLanguage}
      extraControls={<div className="beauty-header-controls">
        <div className="beauty-profession-options" role="group" aria-label={professionCopy[language].label}>{beautyProfessionIds.map((profession) => {
          const definition = beautyProfessionRegistry[profession];
          return <button key={profession} className={professionId === profession ? "is-active" : ""} type="button" onClick={() => changeProfession(profession)} aria-pressed={professionId === profession}><img src={definition.defaultIcon} alt="" /> <span>{definition.publicLabel}</span></button>;
        })}</div>
        <button className="beauty-secondary beauty-header-save" type="button" onClick={() => { void saveWorkspace(); }} disabled={!saveDirty || shareCardRenderPending || saveBusy || publicationBusy} aria-label={saveLabel} title={saveLabel}><Save aria-hidden="true" /> <span>{saveLabel}</span></button>
        <button className="header-icon-button beauty-header-settings" type="button" onClick={openSettings} aria-label={accessibilityCopy[language].settings}><Settings2 /></button>
      </div>}
    />
    <main className="beauty-shell beauty-workspace-shell" data-service-specialization={presentation.specialization} data-beauty-master-route="/services/beauty/master">
      {saveError && <div className="beauty-error" role="alert">{saveError}</div>}
      <section className="beauty-workspace-page">
        <nav className="beauty-domain-rail" aria-label="GO IRL domains">
          <button type="button" aria-label="Activity" title="Activity" onClick={() => window.location.assign("/activities")}><Zap /><span>Activity</span></button>
          <button className="is-active" type="button" aria-label="Services" aria-current="page" title="Services" onClick={() => window.location.assign("/services")}><Sparkles /><span>Services</span></button>
        </nav>
        <BeautyPilotWorkspace
          setup={workspace}
          onEdit={openSettings}
          onPublicationToggle={() => { void togglePublication(); }}
          publicationBusy={publicationBusy || saveBusy || shareCardRenderPending}
          publicationError={publicationError}
          publicationActionLabel={publicationBusy
            ? (workspace.published ? publicationCopy[language].unpublishing : publicationCopy[language].publishing)
            : (workspace.published ? publicationCopy[language].unpublish : publicationCopy[language].publish)}
          pageEditor={<BeautyWorkspaceContentEditor workspace={workspace} language={language} onChange={changeWorkspace} />}
          businessCardEditor={
            <Suspense fallback={<div className="beauty-loading">{loadingCopy[language]}</div>}>
              <BeautyShareCardEditor workspace={workspace} language={language} onChange={changeWorkspace} />
            </Suspense>
          }
        />
      </section>
      {settingsOpen && <BeautyWorkspaceSettingsDialog
        workspace={workspace}
        language={language}
        onChange={changeWorkspace}
        onClose={() => setSettingsOpen(false)}
      />}
    </main>
  </>;
}
