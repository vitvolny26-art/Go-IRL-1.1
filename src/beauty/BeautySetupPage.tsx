import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Eye, House, RotateCcw, Save, Settings2, Share2, Sparkles } from "lucide-react";
import type { Language } from "../types";
import {
  beautyContentLanguages,
  beautyServiceSpecializations,
  beautySetupSteps,
  buildBeautyPublicProfile,
  createDefaultBeautyWorkspace,
  getBeautyStepProgress,
  primaryBeautyService,
  resolveBeautyLocalizedText,
  validateBeautyStep,
  withBeautyServices,
  type BeautyService,
  type BeautyServiceSpecialization,
  type BeautySetupStep,
  type BeautyValidationCode,
  type BeautyWeekday,
  type BeautyWorkspace,
} from "./beautySetupModel";
import { getBeautyCopy, readBeautyLanguage } from "./beautyI18n";
import { loadBeautyWorkspace, resetBeautyWorkspace, saveBeautyWorkspace } from "./beautyWorkspaceStorage";
import { BeautyPilotWorkspace, resetBeautyPilotWorkspace } from "./BeautyPilotWorkspace";
import { BeautyShareCardEditor } from "./BeautyShareCardEditor";
import { BeautyWorkspaceContentEditor } from "./BeautyWorkspaceContentEditor";
import "./beauty-setup.css";
import "./beauty-multilingual-editor.css";

const stepIndex = (step: BeautySetupStep) => beautySetupSteps.indexOf(step as (typeof beautySetupSteps)[number]);

const contentLanguageNames: Record<Language, string> = {
  ru: "Русский",
  uk: "Українська",
  cs: "Čeština",
  en: "English",
};

const setupSpecializationCopy: Record<Language, { label: string; hint: string; options: Record<BeautyServiceSpecialization, string> }> = {
  ru: { label: "Специализация услуги", hint: "От первой активной услуги зависит интерфейс кабинета.", options: { nails: "Nails", barber: "Барбер" } },
  uk: { label: "Спеціалізація послуги", hint: "Від першої активної послуги залежить інтерфейс кабінету.", options: { nails: "Nails", barber: "Барбер" } },
  cs: { label: "Specializace služby", hint: "První aktivní služba určuje rozhraní kabinetu.", options: { nails: "Nails", barber: "Barber" } },
  en: { label: "Service specialization", hint: "The first active service selects the workspace interface.", options: { nails: "Nails", barber: "Barber" } },
};
const workspaceTitles: Record<Language, Record<BeautyServiceSpecialization, string>> = {
  ru: { nails: "Кабинет мастера", barber: "Кабинет барбера" },
  uk: { nails: "Кабінет майстра", barber: "Кабінет барбера" },
  cs: { nails: "Kabinet profesionála", barber: "Barber kabinet" },
  en: { nails: "Professional workspace", barber: "Barber workspace" },
};

const multilingualCopy = {
  ru: {
    title: "Тексты для клиентов",
    hint: "Заполните доступные языки. Клиент увидит свой язык; если перевод пустой, используется английский, затем другой заполненный вариант.",
    description: "Краткое описание",
    service: "Название услуги в прайсе",
  },
  uk: {
    title: "Тексти для клієнтів",
    hint: "Заповніть доступні мови. Клієнт побачить свою мову; якщо переклад порожній, використовується англійська, потім інший заповнений варіант.",
    description: "Короткий опис",
    service: "Назва послуги в прайсі",
  },
  cs: {
    title: "Texty pro klienty",
    hint: "Vyplňte dostupné jazyky. Klient uvidí svůj jazyk; chybějící překlad použije angličtinu a poté jiný vyplněný text.",
    description: "Krátký popis",
    service: "Název služby v ceníku",
  },
  en: {
    title: "Client-facing text",
    hint: "Fill the available languages. Clients see their selected language; an empty translation falls back to English and then another completed value.",
    description: "Short description",
    service: "Price-list service name",
  },
} satisfies Record<Language, Record<string, string>>;

export function BeautySetupPage() {
  const language = readBeautyLanguage();
  const text = getBeautyCopy(language);
  const localizedText = multilingualCopy[language];
  const workspaceRoute = window.location.pathname.replace(/\/+$/, "") === "/beauty/workspace";
  const stepLabels = {
    pro_setup_profile: text.profile,
    pro_setup_service: text.service,
    pro_setup_availability: text.availability,
    pro_setup_review: text.review,
  };
  const [workspace, setWorkspace] = useState<BeautyWorkspace>(() => createDefaultBeautyWorkspace(language));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<BeautyValidationCode[]>([]);
  const [notice, setNotice] = useState("");
  const workspaceSpecialization = primaryBeautyService(workspace).specialization;
  const workspaceTitle = workspaceTitles[language][workspaceSpecialization];
  const specializationText = setupSpecializationCopy[language];

  useEffect(() => {
    let active = true;
    void loadBeautyWorkspace(language)
      .then((loaded) => {
        if (!active) return;
        setWorkspace(!workspaceRoute && loaded.currentStep === "pro_workspace"
          ? { ...loaded, currentStep: "pro_setup_published" }
          : loaded);
      })
      .catch(() => { if (active) setNotice(text.loadError); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [language, text.loadError, workspaceRoute]);

  useEffect(() => {
    if (loading) return;
    setSaving(true);
    void saveBeautyWorkspace(workspace)
      .catch(() => setNotice(text.saveError))
      .finally(() => setSaving(false));
  }, [loading, text.saveError, workspace]);

  const publicProfile = useMemo(() => buildBeautyPublicProfile(workspace, language), [language, workspace]);
  const progress = getBeautyStepProgress(workspace.currentStep);
  const update = (fn: (current: BeautyWorkspace) => BeautyWorkspace) => { setWorkspace(fn); setErrors([]); };
  const goTo = (step: BeautySetupStep) => update((current) => ({ ...current, currentStep: step }));
  const goHome = () => window.location.assign("/services");
  const openSetup = () => {
    const next: BeautyWorkspace = { ...workspace, currentStep: "pro_setup_profile" };
    setWorkspace(next);
    void saveBeautyWorkspace(next).finally(() => window.location.assign("/beauty"));
  };

  const updatePrimaryService = (fn: (service: BeautyService) => BeautyService) => update((current) => {
    const services = current.services.length ? current.services : [current.service];
    const primaryIndex = Math.max(0, services.findIndex((item) => item.active));
    const nextServices = services.map((item, index) => index === primaryIndex ? fn(item) : item);
    return withBeautyServices(current, nextServices);
  });

  const next = () => {
    const validation = validateBeautyStep(workspace, workspace.currentStep);
    if (validation.length) return setErrors(validation);
    const index = stepIndex(workspace.currentStep);
    if (index >= 0 && index < beautySetupSteps.length - 1) goTo(beautySetupSteps[index + 1]);
  };

  const back = () => {
    if (workspaceRoute) return goHome();
    if (workspace.currentStep === "pro_workspace") return goTo("pro_setup_published");
    if (workspace.currentStep === "pro_public_preview") return goTo("pro_setup_published");
    if (workspace.currentStep === "pro_setup_published") return goHome();
    const index = stepIndex(workspace.currentStep);
    if (index > 0) goTo(beautySetupSteps[index - 1]);
    else goHome();
  };

  const publish = () => {
    const validation = beautySetupSteps.flatMap((step) => validateBeautyStep(workspace, step));
    if (validation.length) return setErrors(validation);
    update((current) => ({ ...current, published: true, currentStep: "pro_setup_published" }));
  };

  const reset = async () => {
    if (!window.confirm(text.reset)) return;
    await resetBeautyWorkspace();
    resetBeautyPilotWorkspace();
    setWorkspace(createDefaultBeautyWorkspace(language));
    setErrors([]);
    setNotice(text.resetDone);
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(workspace.publicLink); setNotice(text.copied); }
    catch { setNotice(workspace.publicLink); }
  };

  const toggleDay = (day: BeautyWeekday) => update((current) => ({
    ...current,
    availability: {
      ...current.availability,
      weekdays: current.availability.weekdays.includes(day)
        ? current.availability.weekdays.filter((item) => item !== day)
        : [...current.availability.weekdays, day],
    },
  }));

  const updateDescription = (contentLanguage: Language, value: string) => update((current) => {
    const descriptionByLanguage = { ...current.profile.descriptionByLanguage, [contentLanguage]: value };
    return {
      ...current,
      profile: {
        ...current.profile,
        descriptionByLanguage,
        description: resolveBeautyLocalizedText(descriptionByLanguage, language, ""),
      },
    };
  });

  const updateServiceName = (contentLanguage: Language, value: string) => updatePrimaryService((service) => {
    const nameByLanguage = { ...service.nameByLanguage, [contentLanguage]: value };
    return {
      ...service,
      nameByLanguage,
      name: resolveBeautyLocalizedText(nameByLanguage, language, ""),
    };
  });

  const descriptionEditor = <section className="beauty-localized-editor beauty-span-two">
    <div className="beauty-localized-heading"><strong>{localizedText.title}</strong><span>{localizedText.hint}</span></div>
    <div className="beauty-localized-grid">{beautyContentLanguages.map((contentLanguage) => <label key={`description-${contentLanguage}`}>
      <span>{localizedText.description} · {contentLanguageNames[contentLanguage]}</span>
      <textarea rows={3} value={workspace.profile.descriptionByLanguage[contentLanguage]} onChange={(event) => updateDescription(contentLanguage, event.target.value)} />
    </label>)}</div>
  </section>;

  const serviceNameEditor = <section className="beauty-localized-editor beauty-span-two">
    <div className="beauty-localized-heading"><strong>{localizedText.title}</strong><span>{localizedText.hint}</span></div>
    <div className="beauty-localized-grid">{beautyContentLanguages.map((contentLanguage) => <label key={`service-${contentLanguage}`}>
      <span>{localizedText.service} · {contentLanguageNames[contentLanguage]}</span>
      <input value={workspace.service.nameByLanguage[contentLanguage]} onChange={(event) => updateServiceName(contentLanguage, event.target.value)} />
    </label>)}</div>
  </section>;

  const profile = <div className="beauty-form-grid">
    <label>{text.publicName}<input value={workspace.profile.displayName} onChange={(e) => update((c) => ({ ...c, profile: { ...c.profile, displayName: e.target.value } }))} /></label>
    <label>{text.city}<input value={workspace.profile.city} onChange={(e) => update((c) => ({ ...c, profile: { ...c.profile, city: e.target.value } }))} /></label>
    <label>{text.publicArea}<input value={workspace.profile.publicLocation} onChange={(e) => update((c) => ({ ...c, profile: { ...c.profile, publicLocation: e.target.value } }))} /><small>{text.publicAreaHint}</small></label>
    <label>{text.contact}<input value={workspace.profile.contact} onChange={(e) => update((c) => ({ ...c, profile: { ...c.profile, contact: e.target.value } }))} /><small>{text.contactHint}</small></label>
    <label className="beauty-span-two">{text.exactAddress}<input value={workspace.profile.exactAddress} onChange={(e) => update((c) => ({ ...c, profile: { ...c.profile, exactAddress: e.target.value } }))} /><small>{text.exactAddressHint}</small></label>
    {descriptionEditor}
  </div>;

  const service = <div className="beauty-form-grid">
    <label className="beauty-span-two">{specializationText.label}<select value={workspace.service.specialization} onChange={(e) => updatePrimaryService((item) => ({ ...item, specialization: e.target.value as BeautyServiceSpecialization }))}>{beautyServiceSpecializations.map((item) => <option key={item} value={item}>{specializationText.options[item]}</option>)}</select><small>{specializationText.hint}</small></label>
    {serviceNameEditor}
    <label>{text.duration}<input type="number" min="5" max="480" value={workspace.service.durationMinutes} onChange={(e) => updatePrimaryService((item) => ({ ...item, durationMinutes: Number(e.target.value) }))} /></label>
    <label>{text.price}<input type="number" min="0" max="100000" value={workspace.service.priceCzk} onChange={(e) => updatePrimaryService((item) => ({ ...item, priceCzk: Number(e.target.value) }))} /></label>
    <label>{text.buffer}<input type="number" min="0" max="240" value={workspace.service.bufferMinutes} onChange={(e) => updatePrimaryService((item) => ({ ...item, bufferMinutes: Number(e.target.value) }))} /></label>
  </div>;

  const availability = <div className="beauty-stack">
    <div className="beauty-note"><strong>{text.recurring}</strong><span>{text.recurringHint}</span></div>
    <div className="beauty-weekdays" aria-label={text.workdays}>{(Object.keys(text.weekdays) as BeautyWeekday[]).map((day) => <button key={day} type="button" className={workspace.availability.weekdays.includes(day) ? "is-selected" : ""} onClick={() => toggleDay(day)}>{text.weekdays[day]}</button>)}</div>
    <div className="beauty-form-grid">
      <label>{text.from}<input type="time" value={workspace.availability.startTime} onChange={(e) => update((c) => ({ ...c, availability: { ...c.availability, startTime: e.target.value } }))} /></label>
      <label>{text.to}<input type="time" value={workspace.availability.endTime} onChange={(e) => update((c) => ({ ...c, availability: { ...c.availability, endTime: e.target.value } }))} /></label>
      <label className="beauty-checkbox beauty-span-two"><input type="checkbox" checked={workspace.availability.breakEnabled} onChange={(e) => update((c) => ({ ...c, availability: { ...c.availability, breakEnabled: e.target.checked } }))} />{text.addBreak}</label>
      {workspace.availability.breakEnabled && <><label>{text.from}<input type="time" value={workspace.availability.breakStart} onChange={(e) => update((c) => ({ ...c, availability: { ...c.availability, breakStart: e.target.value } }))} /></label><label>{text.to}<input type="time" value={workspace.availability.breakEnd} onChange={(e) => update((c) => ({ ...c, availability: { ...c.availability, breakEnd: e.target.value } }))} /></label></>}
    </div>
  </div>;

  const review = <div className="beauty-review-list">
    <button type="button" onClick={() => goTo("pro_setup_profile")}><span><strong>{workspace.profile.displayName}</strong><small>{publicProfile.description}</small></span><span>{text.edit}</span></button>
    <button type="button" onClick={() => goTo("pro_setup_service")}><span><strong>{publicProfile.serviceName}</strong><small>{workspace.service.durationMinutes} min · {workspace.service.priceCzk} Kč</small></span><span>{text.edit}</span></button>
    <button type="button" onClick={() => goTo("pro_setup_availability")}><span><strong>{workspace.availability.weekdays.map((day) => text.weekdays[day]).join(", ")}</strong><small>{workspace.availability.startTime}–{workspace.availability.endTime}</small></span><span>{text.edit}</span></button>
    <div className="beauty-note"><strong>{text.privateData}</strong><span>{text.privateHint}</span></div>
  </div>;

  const published = <div className="beauty-published">
    <div className="beauty-success"><Check /><div><strong>{text.published}</strong><span>{text.publishedHint}</span></div></div>
    <div className="beauty-public-link"><span>{workspace.publicLink}</span><button type="button" onClick={copyLink}><Share2 size={18} />{text.copyLink}</button></div>
    <button className="beauty-primary" type="button" onClick={() => goTo("pro_public_preview")}><Eye size={19} />{text.openPreview}</button>
    <button className="beauty-primary" type="button" onClick={() => window.location.assign("/beauty/workspace")}>Открыть кабинет и Booking</button>
    <button className="beauty-secondary" type="button" onClick={() => goTo("pro_setup_review")}>{text.editSetup}</button>
    <button className="beauty-home-button" type="button" onClick={goHome}><House size={19} />{text.home}</button>
  </div>;

  const preview = <div className="beauty-public-preview" aria-label={text.previewTitle}>
    <span className="beauty-preview-badge">{text.publicPreview}</span>
    <h2>{publicProfile.displayName}</h2><p>{publicProfile.publicLocation}</p>
    {publicProfile.description && <div className="beauty-preview-card"><strong>{publicProfile.description}</strong><span>{publicProfile.serviceName}</span></div>}
    {publicProfile.services.map((item) => <div className="beauty-preview-card" key={item.id}><strong>{item.name}</strong><span>{item.durationMinutes} min</span><b>{item.priceCzk} Kč</b></div>)}
    <div className="beauty-preview-card"><strong>{text.available}</strong><span>{publicProfile.weekdays.map((day) => text.weekdays[day]).join(", ")}</span><span>{publicProfile.startTime}–{publicProfile.endTime}</span></div>
    <div className="beauty-note"><strong>{text.privacy}</strong><span>{text.privacyHint}</span></div>
    <button className="beauty-primary" type="button" disabled>{text.chooseTime}</button>
    <button className="beauty-home-button" type="button" onClick={goHome}><House size={19} />{text.home}</button>
  </div>;

  const content = workspace.currentStep === "pro_setup_profile" ? profile : workspace.currentStep === "pro_setup_service" ? service : workspace.currentStep === "pro_setup_availability" ? availability : workspace.currentStep === "pro_setup_review" ? review : workspace.currentStep === "pro_setup_published" ? published : preview;
  if (loading) return <main className="beauty-shell"><div className="beauty-loading">{text.loading}</div></main>;
  if (workspaceRoute) return <main className="beauty-shell beauty-workspace-shell" data-service-specialization={workspaceSpecialization}>
    <header className="beauty-topbar"><button className="beauty-icon-button" type="button" onClick={goHome} aria-label={text.back}><ArrowLeft /></button><div><span>GO IRL · {workspaceSpecialization === "barber" ? "Barber" : "Nails"} · {text.localFirst}</span><h1>{workspaceTitle}</h1></div><button className="beauty-icon-button" type="button" onClick={openSetup} aria-label={text.editSetup}><Settings2 /></button></header>
    <section className="beauty-workspace-page">
      <BeautyPilotWorkspace setup={workspace} onEdit={openSetup} />
      <BeautyWorkspaceContentEditor workspace={workspace} language={language} onChange={(next) => { setWorkspace(next); setErrors([]); }} />
      <BeautyShareCardEditor workspace={workspace} language={language} onChange={(next) => { setWorkspace(next); setErrors([]); }} />
    </section>
    <div className="beauty-storage-status"><Save size={15} />{saving ? text.saving : text.saved}</div>
  </main>;

  return <main className="beauty-shell" data-service-specialization={workspaceSpecialization}>
    <header className="beauty-topbar"><button className="beauty-icon-button" type="button" onClick={back} aria-label={text.back}><ArrowLeft /></button><div><span>GO IRL Beauty · {text.localFirst}</span><h1>{workspace.currentStep === "pro_public_preview" ? text.previewTitle : workspace.currentStep === "pro_workspace" ? "Beauty workspace" : text.title}</h1></div><button className="beauty-icon-button" type="button" onClick={reset} aria-label={text.reset}><RotateCcw /></button></header>
    {progress && <div className="beauty-progress" aria-label={`${text.step} ${progress.current}`}><div>{beautySetupSteps.map((step, index) => <span key={step} className={index < progress.current ? "is-active" : ""} />)}</div><p>{text.step} {progress.current}/{progress.total} · {stepLabels[workspace.currentStep as (typeof beautySetupSteps)[number]]}</p></div>}
    <section className="beauty-card">{content}{errors.length > 0 && <div className="beauty-errors" role="alert">{errors.map((code) => <p key={code}>{text.error(code)}</p>)}</div>}{notice && <div className="beauty-notice" role="status">{notice}</div>}</section>
    {progress && <footer className="beauty-actions"><button className="beauty-secondary" type="button" onClick={back}>{text.back}</button>{workspace.currentStep === "pro_setup_review" ? <button className="beauty-primary" type="button" onClick={publish}><Sparkles size={19} />{text.publish}</button> : <button className="beauty-primary" type="button" onClick={next}>{text.continue}</button>}</footer>}
    <div className="beauty-storage-status"><Save size={15} />{saving ? text.saving : text.saved}</div>
  </main>;
}
