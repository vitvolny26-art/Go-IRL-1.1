import { useMemo, useState } from "react";
import { Plus, Save, X } from "lucide-react";
import type { Language } from "../types";
import {
  resolveBeautyLocalizedText,
  withBeautyServices,
  type BeautyWeekday,
  type BeautyWorkspace,
} from "./beautySetupModel";
import { saveBeautyWorkspaceProfile } from "./beautyWorkspaceStorage";
import { createBeautyProfessionService, professionServiceSuggestions, resolveBeautyProfessionId } from "./beautyProfessionRegistry";

type BeautyWorkspaceSettingsDialogProps = {
  workspace: BeautyWorkspace;
  language: Language;
  onChange: (workspace: BeautyWorkspace) => void;
  onClose: () => void;
};

const copy = {
  ru: {
    title: "Настройки мастера",
    hint: "Профиль, услуга и расписание меняются здесь — без перехода в старый мастер настройки.",
    profile: "Профиль",
    publicName: "Имя мастера",
    publicLocation: "Район",
    contact: "Контакт",
    exactAddress: "Точный адрес",
    service: "Услуги",
    addService: "Добавить услугу",
    errorReason: "Причина",
    serviceName: "Название",
    duration: "Длительность, мин",
    price: "Цена, Kč",
    buffer: "Буфер, мин",
    schedule: "Расписание",
    scheduleHint: "Эти рабочие часы формируют свободные слоты в клиентском календаре.",
    from: "С",
    to: "До",
    break: "Регулярный перерыв",
    save: "Сохранить",
    saving: "Сохраняем…",
    saved: "Сохранено",
    error: "Не удалось сохранить. Проверьте данные и повторите.",
  },
  uk: {
    title: "Налаштування майстра",
    hint: "Профіль, послуга й розклад змінюються тут — без переходу до старого майстра налаштування.",
    profile: "Профіль",
    publicName: "Ім’я майстра",
    publicLocation: "Район",
    contact: "Контакт",
    exactAddress: "Точна адреса",
    service: "Послуги",
    addService: "Додати послугу",
    errorReason: "Причина",
    serviceName: "Назва",
    duration: "Тривалість, хв",
    price: "Ціна, Kč",
    buffer: "Буфер, хв",
    schedule: "Розклад",
    scheduleHint: "Ці робочі години формують вільні слоти в календарі клієнта.",
    from: "З",
    to: "До",
    break: "Регулярна перерва",
    save: "Зберегти",
    saving: "Зберігаємо…",
    saved: "Збережено",
    error: "Не вдалося зберегти. Перевірте дані й повторіть.",
  },
  cs: {
    title: "Nastavení profesionála",
    hint: "Profil, službu a rozvrh upravíte tady bez přechodu do starého průvodce.",
    profile: "Profil",
    publicName: "Jméno",
    publicLocation: "Oblast",
    contact: "Kontakt",
    exactAddress: "Přesná adresa",
    service: "Služby",
    addService: "Přidat službu",
    errorReason: "Důvod",
    serviceName: "Název",
    duration: "Délka, min",
    price: "Cena, Kč",
    buffer: "Buffer, min",
    schedule: "Rozvrh",
    scheduleHint: "Tato pracovní doba vytváří volné termíny v klientském kalendáři.",
    from: "Od",
    to: "Do",
    break: "Pravidelná pauza",
    save: "Uložit",
    saving: "Ukládám…",
    saved: "Uloženo",
    error: "Uložení se nezdařilo. Zkontrolujte údaje a zkuste to znovu.",
  },
  en: {
    title: "Professional settings",
    hint: "Edit profile, service and schedule here without leaving the workspace for the old setup wizard.",
    profile: "Profile",
    publicName: "Professional name",
    publicLocation: "Area",
    contact: "Contact",
    exactAddress: "Exact address",
    service: "Services",
    addService: "Add service",
    errorReason: "Reason",
    serviceName: "Name",
    duration: "Duration, min",
    price: "Price, CZK",
    buffer: "Buffer, min",
    schedule: "Schedule",
    scheduleHint: "These working hours generate free slots in the client booking calendar.",
    from: "From",
    to: "To",
    break: "Recurring break",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    error: "Could not save. Check the values and try again.",
  },
} satisfies Record<Language, Record<string, string>>;

const weekdayOrder: BeautyWeekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const weekdayLabels: Record<Language, Record<BeautyWeekday, string>> = {
  ru: { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" },
  uk: { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Нд" },
  cs: { mon: "Po", tue: "Út", wed: "St", thu: "Čt", fri: "Pá", sat: "So", sun: "Ne" },
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
};

const describeSaveFailure = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    const detail = error as { code?: unknown; message?: unknown; details?: unknown };
    const code = typeof detail.code === "string" ? detail.code.trim() : "";
    const message = typeof detail.message === "string" ? detail.message.trim() : "";
    const details = typeof detail.details === "string" ? detail.details.trim() : "";
    return [code, message, details].filter(Boolean).join(" · ") || "unknown_error";
  }
  return typeof error === "string" && error.trim() ? error.trim() : "unknown_error";
};

export function BeautyWorkspaceSettingsDialog({ workspace, language, onChange, onClose }: BeautyWorkspaceSettingsDialogProps) {
  const text = copy[language];
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<"" | "saved" | "error">("");
  const [errorReason, setErrorReason] = useState("");
  const editableServices = useMemo(() => workspace.services.length ? workspace.services : [workspace.service], [workspace.service, workspace.services]);
  const professionId = resolveBeautyProfessionId(workspace);
  const serviceSuggestions = professionServiceSuggestions(professionId, language);

  const updateWorkspace = (next: BeautyWorkspace) => {
    setNotice("");
    setErrorReason("");
    onChange(next);
  };

  const updateService = (index: number, changes: Partial<(typeof editableServices)[number]>) => {
    const nextServices = editableServices.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item);
    updateWorkspace(withBeautyServices(workspace, nextServices));
  };

  const updateServiceName = (index: number, value: string) => {
    const service = editableServices[index];
    const nameByLanguage = { ...service.nameByLanguage, [language]: value };
    updateService(index, {
      nameByLanguage,
      name: resolveBeautyLocalizedText(nameByLanguage, language, value),
    });
  };

  const addService = () => updateWorkspace(withBeautyServices(workspace, [...editableServices, createBeautyProfessionService(language, professionId, editableServices.length)]));

  const updateAvailability = (changes: Partial<BeautyWorkspace["availability"]>) => updateWorkspace({
    ...workspace,
    availability: { ...workspace.availability, ...changes },
  });

  const toggleDay = (day: BeautyWeekday) => updateAvailability({
    weekdays: workspace.availability.weekdays.includes(day)
      ? workspace.availability.weekdays.filter((item) => item !== day)
      : [...workspace.availability.weekdays, day],
  });

  const save = async () => {
    setSaving(true);
    setNotice("");
    setErrorReason("");
    try {
      await saveBeautyWorkspaceProfile(workspace);
      setNotice("saved");
    } catch (error) {
      setErrorReason(describeSaveFailure(error));
      setNotice("error");
    } finally {
      setSaving(false);
    }
  };

  return <div className="beauty-dialog-backdrop" role="presentation" onPointerDown={onClose}>
    <section className="beauty-dialog beauty-workspace-settings-dialog" role="dialog" aria-modal="true" aria-label={text.title} onPointerDown={(event) => event.stopPropagation()}>
      <button className="beauty-dialog-close" type="button" aria-label="Close" onClick={onClose}><X /></button>
      <h2>{text.title}</h2>
      <p>{text.hint}</p>

      <div className="beauty-stack">
        <div className="beauty-note"><strong>{text.profile}</strong></div>
        <div className="beauty-form-grid">
          <label>{text.publicName}<input value={workspace.profile.displayName} onChange={(event) => updateWorkspace({ ...workspace, profile: { ...workspace.profile, displayName: event.target.value } })} /></label>
          <label>{text.publicLocation}<input value={workspace.profile.publicLocation} onChange={(event) => updateWorkspace({ ...workspace, profile: { ...workspace.profile, publicLocation: event.target.value } })} /></label>
          <label>{text.contact}<input value={workspace.profile.contact} onChange={(event) => updateWorkspace({ ...workspace, profile: { ...workspace.profile, contact: event.target.value } })} /></label>
          <label>{text.exactAddress}<input value={workspace.profile.exactAddress} onChange={(event) => updateWorkspace({ ...workspace, profile: { ...workspace.profile, exactAddress: event.target.value } })} /></label>
        </div>

        <div className="beauty-note"><strong>{text.service}</strong></div>
        <div className="beauty-stack beauty-workspace-settings-services">
          <datalist id={`beauty-settings-service-presets-${professionId}`}>{serviceSuggestions.map((name) => <option key={name} value={name} />)}</datalist>
          {editableServices.map((service, index) => <div className="beauty-form-grid" key={service.id}>
            <label className="beauty-span-two">{text.serviceName} {index + 1}<input list={`beauty-settings-service-presets-${professionId}`} value={service.nameByLanguage[language] || service.name} onChange={(event) => updateServiceName(index, event.target.value)} /></label>
            <label>{text.duration}<input type="number" min="5" max="480" value={service.durationMinutes} onChange={(event) => updateService(index, { durationMinutes: Number(event.target.value) })} /></label>
            <label>{text.price}<input type="number" min="0" max="100000" value={service.priceCzk} onChange={(event) => updateService(index, { priceCzk: Number(event.target.value) })} /></label>
            <label>{text.buffer}<input type="number" min="0" max="240" value={service.bufferMinutes} onChange={(event) => updateService(index, { bufferMinutes: Number(event.target.value) })} /></label>
          </div>)}
          <button className="beauty-secondary" type="button" onClick={addService}><Plus size={18} />{text.addService}</button>
        </div>

        <div className="beauty-note"><strong>{text.schedule}</strong><span>{text.scheduleHint}</span></div>
        <div className="beauty-weekdays" aria-label={text.schedule}>{weekdayOrder.map((day) => <button key={day} type="button" className={workspace.availability.weekdays.includes(day) ? "is-selected" : ""} onClick={() => toggleDay(day)}>{weekdayLabels[language][day]}</button>)}</div>
        <div className="beauty-form-grid">
          <label>{text.from}<input type="time" value={workspace.availability.startTime} onChange={(event) => updateAvailability({ startTime: event.target.value })} /></label>
          <label>{text.to}<input type="time" value={workspace.availability.endTime} onChange={(event) => updateAvailability({ endTime: event.target.value })} /></label>
          <label className="beauty-checkbox beauty-span-two"><input type="checkbox" checked={workspace.availability.breakEnabled} onChange={(event) => updateAvailability({ breakEnabled: event.target.checked })} />{text.break}</label>
          {workspace.availability.breakEnabled && <>
            <label>{text.from}<input type="time" value={workspace.availability.breakStart} onChange={(event) => updateAvailability({ breakStart: event.target.value })} /></label>
            <label>{text.to}<input type="time" value={workspace.availability.breakEnd} onChange={(event) => updateAvailability({ breakEnd: event.target.value })} /></label>
          </>}
        </div>
      </div>

      {notice === "saved" && <div className="beauty-success"><span>{text.saved}</span></div>}
      {notice === "error" && <div className="beauty-errors"><strong>{text.error}</strong>{errorReason && <small>{text.errorReason}: {errorReason}</small>}</div>}
      <button className="beauty-primary" type="button" disabled={saving} onClick={() => { void save(); }}><Save size={18} />{saving ? text.saving : text.save}</button>
    </section>
  </div>;
}
