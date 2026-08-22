import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import type { Language } from "../types";
import {
  beautyContentLanguages,
  beautyServiceSpecializations,
  createBeautyPortfolioItem,
  createBeautyService,
  primaryBeautyService,
  resolveBeautyLocalizedText,
  withBeautyServices,
  type BeautyLocalizedText,
  type BeautyService,
  type BeautyServiceSpecialization,
  type BeautyWorkspace,
} from "./beautySetupModel";
import { uploadBeautyPortfolioPhoto } from "./beautyPortfolioUpload";
import "./beauty-workspace-content-editor.css";

type Tab = "profile" | "portfolio" | "prices";
type ProfileTextKey =
  | "descriptionByLanguage"
  | "experienceByLanguage"
  | "specializationByLanguage"
  | "hygieneByLanguage"
  | "materialsByLanguage"
  | "spokenLanguagesByLanguage"
  | "certificatesByLanguage"
  | "bookingNotesByLanguage";

const maxPortfolioItems = 3;
const languageNames: Record<Language, string> = { ru: "RU", uk: "UK", cs: "CS", en: "EN" };
const newServiceNames = (number: number) => ({
  ru: `Новая услуга ${number}`,
  uk: `Нова послуга ${number}`,
  cs: `Nová služba ${number}`,
  en: `New service ${number}`,
});

const copy = {
  ru: {
    title: "Страница мастера и прайс", hint: "Пустые необязательные блоки не показываются клиентам.", profile: "Профиль", portfolio: "Портфолио", prices: "Прайс", required: "Обязательно", optional: "Необязательно", publicName: "Публичное имя", city: "Город", publicLocation: "Район для клиентов", contact: "Контакт мастера", exactAddress: "Точный адрес", description: "О мастере", instagram: "Instagram", experience: "Опыт", specialization: "Специализация", hygiene: "Гигиена и стерилизация", materials: "Материалы и бренды", languages: "Языки общения", certificates: "Обучение и сертификаты", bookingNotes: "Важное перед записью", portfolioHint: "Загрузите до 3 фотографий с телефона или компьютера. Ссылка остаётся дополнительным вариантом.", addWork: "Добавить работу", limitReached: "Можно добавить максимум 3 фото", imageUrl: "Ссылка на изображение", imageAlt: "Описание фото", uploadPhoto: "Загрузить фото", uploading: "Загрузка…", uploadTypeHint: "JPG, PNG или WebP до 8 МБ", uploadError: "Не удалось загрузить фото. Проверьте формат, размер и повторите.", open: "Открыть", remove: "Удалить", pricesHint: "Нужна минимум одна активная услуга с названием, длительностью и ценой.", addService: "Добавить услугу", active: "Активна", serviceName: "Название услуги", duration: "Длительность, мин", price: "Цена, Kč", buffer: "Буфер, мин", cannotRemove: "Нельзя удалить единственную услугу",
  },
  uk: {
    title: "Сторінка майстра і прайс", hint: "Порожні необов’язкові блоки не показуються клієнтам.", profile: "Профіль", portfolio: "Портфоліо", prices: "Прайс", required: "Обов’язково", optional: "Необов’язково", publicName: "Публічне ім’я", city: "Місто", publicLocation: "Район для клієнтів", contact: "Контакт майстра", exactAddress: "Точна адреса", description: "Про майстра", instagram: "Instagram", experience: "Досвід", specialization: "Спеціалізація", hygiene: "Гігієна та стерилізація", materials: "Матеріали та бренди", languages: "Мови спілкування", certificates: "Навчання та сертифікати", bookingNotes: "Важливе перед записом", portfolioHint: "Завантажте до 3 фотографій з телефону або комп’ютера. Посилання залишається додатковим варіантом.", addWork: "Додати роботу", limitReached: "Можна додати максимум 3 фото", imageUrl: "Посилання на зображення", imageAlt: "Опис фото", uploadPhoto: "Завантажити фото", uploading: "Завантаження…", uploadTypeHint: "JPG, PNG або WebP до 8 МБ", uploadError: "Не вдалося завантажити фото. Перевірте формат, розмір і повторіть.", open: "Відкрити", remove: "Видалити", pricesHint: "Потрібна щонайменше одна активна послуга з назвою, тривалістю та ціною.", addService: "Додати послугу", active: "Активна", serviceName: "Назва послуги", duration: "Тривалість, хв", price: "Ціна, Kč", buffer: "Буфер, хв", cannotRemove: "Не можна видалити єдину послугу",
  },
  cs: {
    title: "Profil profesionála a ceník", hint: "Prázdné nepovinné sekce se klientům nezobrazí.", profile: "Profil", portfolio: "Portfolio", prices: "Ceník", required: "Povinné", optional: "Nepovinné", publicName: "Veřejné jméno", city: "Město", publicLocation: "Oblast pro klienty", contact: "Kontakt profesionála", exactAddress: "Přesná adresa", description: "O profesionálovi", instagram: "Instagram", experience: "Praxe", specialization: "Specializace", hygiene: "Hygiena a sterilizace", materials: "Materiály a značky", languages: "Jazyky komunikace", certificates: "Vzdělání a certifikáty", bookingNotes: "Důležité před rezervací", portfolioHint: "Nahrajte až 3 fotografie z telefonu nebo počítače. Odkaz zůstává doplňkovou možností.", addWork: "Přidat práci", limitReached: "Lze přidat nejvýše 3 fotografie", imageUrl: "Odkaz na obrázek", imageAlt: "Popis fotografie", uploadPhoto: "Nahrát fotografii", uploading: "Nahrávání…", uploadTypeHint: "JPG, PNG nebo WebP do 8 MB", uploadError: "Fotografii se nepodařilo nahrát. Zkontrolujte formát a velikost.", open: "Otevřít", remove: "Odstranit", pricesHint: "Je nutná alespoň jedna aktivní služba s názvem, délkou a cenou.", addService: "Přidat službu", active: "Aktivní", serviceName: "Název služby", duration: "Délka, min", price: "Cena, Kč", buffer: "Buffer, min", cannotRemove: "Jedinou službu nelze odstranit",
  },
  en: {
    title: "Professional page and price list", hint: "Empty optional sections are not shown to clients.", profile: "Profile", portfolio: "Portfolio", prices: "Price list", required: "Required", optional: "Optional", publicName: "Public name", city: "City", publicLocation: "Client-facing area", contact: "Professional contact", exactAddress: "Exact address", description: "About the professional", instagram: "Instagram", experience: "Experience", specialization: "Specialization", hygiene: "Hygiene and sterilization", materials: "Materials and brands", languages: "Spoken languages", certificates: "Training and certificates", bookingNotes: "Before booking", portfolioHint: "Upload up to 3 photos from your phone or computer. A direct link remains available as an alternative.", addWork: "Add work", limitReached: "You can add up to 3 photos", imageUrl: "Image URL", imageAlt: "Image description", uploadPhoto: "Upload photo", uploading: "Uploading…", uploadTypeHint: "JPG, PNG or WebP up to 8 MB", uploadError: "The photo could not be uploaded. Check its type and size and try again.", open: "Open", remove: "Remove", pricesHint: "At least one active service with a name, duration, and price is required.", addService: "Add service", active: "Active", serviceName: "Service name", duration: "Duration, min", price: "Price, CZK", buffer: "Buffer, min", cannotRemove: "The only service cannot be removed",
  },
} satisfies Record<Language, Record<string, string>>;

const specializationCopy: Record<Language, { label: string; hint: string; options: Record<BeautyServiceSpecialization, string> }> = {
  ru: { label: "Специализация", hint: "Интерфейс кабинета определяется первой активной услугой.", options: { nails: "Nails", barber: "Barbering" } },
  uk: { label: "Спеціалізація", hint: "Інтерфейс кабінету визначає перша активна послуга.", options: { nails: "Nails", barber: "Barbering" } },
  cs: { label: "Specializace", hint: "Rozhraní kabinetu určuje první aktivní služba.", options: { nails: "Nails", barber: "Barbering" } },
  en: { label: "Specialization", hint: "The first active service selects the workspace interface.", options: { nails: "Nails", barber: "Barbering" } },
};
const barberCopy: Record<Language, Partial<Record<keyof (typeof copy)["en"], string>>> = {
  ru: { title: "Кабинет барбера и услуги", portfolio: "Работы", prices: "Услуги", publicName: "Имя барбера", publicLocation: "Барбершоп / район", contact: "Контакт барбера", description: "О барбере", pricesHint: "Добавьте услуги барбера: название, длительность и цену.", addService: "Добавить услугу барбера" },
  uk: { title: "Кабінет барбера і послуги", portfolio: "Роботи", prices: "Послуги", publicName: "Ім’я барбера", publicLocation: "Барбершоп / район", contact: "Контакт барбера", description: "Про барбера", pricesHint: "Додайте послуги барбера: назву, тривалість і ціну.", addService: "Додати послугу барбера" },
  cs: { title: "Barber kabinet a služby", portfolio: "Práce", prices: "Služby", publicName: "Jméno barbera", publicLocation: "Barbershop / oblast", contact: "Kontakt barbera", description: "O barberovi", pricesHint: "Přidejte barber služby: název, délku a cenu.", addService: "Přidat barber službu" },
  en: { title: "Barber workspace and services", portfolio: "Work", prices: "Services", publicName: "Barber name", publicLocation: "Barbershop / area", contact: "Barber contact", description: "About the barber", pricesHint: "Add barber services with a name, duration, and price.", addService: "Add barber service" },
};

const profileFields: Array<{ key: ProfileTextKey; label: keyof (typeof copy)["en"]; rows: number }> = [
  { key: "descriptionByLanguage", label: "description", rows: 4 },
  { key: "experienceByLanguage", label: "experience", rows: 3 },
  { key: "specializationByLanguage", label: "specialization", rows: 3 },
  { key: "hygieneByLanguage", label: "hygiene", rows: 3 },
  { key: "materialsByLanguage", label: "materials", rows: 3 },
  { key: "spokenLanguagesByLanguage", label: "languages", rows: 2 },
  { key: "certificatesByLanguage", label: "certificates", rows: 3 },
  { key: "bookingNotesByLanguage", label: "bookingNotes", rows: 3 },
];

const move = <T,>(items: T[], index: number, direction: -1 | 1) => {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export function BeautyWorkspaceContentEditor({ workspace, language, onChange }: { workspace: BeautyWorkspace; language: Language; onChange: (next: BeautyWorkspace) => void }) {
  const [tab, setTab] = useState<Tab>("profile");
  const [contentLanguage, setContentLanguage] = useState<Language>(language);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const activeSpecialization = primaryBeautyService(workspace).specialization;
  const text = activeSpecialization === "barber" ? { ...copy[language], ...barberCopy[language] } : copy[language];
  const specializationText = specializationCopy[language];
  const visiblePortfolio = workspace.portfolio.slice(0, maxPortfolioItems);
  const portfolioLimitReached = visiblePortfolio.length >= maxPortfolioItems;

  const updateProfile = <K extends keyof BeautyWorkspace["profile"]>(key: K, value: BeautyWorkspace["profile"][K]) => onChange({ ...workspace, profile: { ...workspace.profile, [key]: value } });
  const updateProfileText = (key: ProfileTextKey, value: string) => {
    const localized = { ...(workspace.profile[key] as BeautyLocalizedText), [contentLanguage]: value };
    const profile = { ...workspace.profile, [key]: localized };
    if (key === "descriptionByLanguage") profile.description = resolveBeautyLocalizedText(localized, language, "");
    onChange({ ...workspace, profile });
  };
  const updateServices = (services: BeautyService[]) => onChange(withBeautyServices(workspace, services));
  const addService = () => {
    const service = createBeautyService(language, workspace.services.length);
    const nameByLanguage = newServiceNames(workspace.services.length + 1);
    updateServices([...workspace.services, { ...service, specialization: activeSpecialization, name: nameByLanguage[language], nameByLanguage, durationMinutes: 60, priceCzk: 0, bufferMinutes: 0 }]);
  };
  const updateService = (index: number, patch: Partial<BeautyService>) => updateServices(workspace.services.map((service, itemIndex) => itemIndex === index ? { ...service, ...patch } : service));
  const removeService = (index: number) => { if (workspace.services.length > 1) updateServices(workspace.services.filter((_, itemIndex) => itemIndex !== index)); };
  const updatePortfolio = (portfolio: BeautyWorkspace["portfolio"]) => onChange({ ...workspace, portfolio: portfolio.slice(0, maxPortfolioItems).map((item, index) => ({ ...item, sortOrder: index })) });

  const uploadPhoto = async (index: number, file?: File) => {
    if (!file) return;
    const item = visiblePortfolio[index];
    setUploadingId(item.id);
    setUploadError("");
    try {
      const imageUrl = await uploadBeautyPortfolioPhoto(file);
      updatePortfolio(visiblePortfolio.map((work, itemIndex) => itemIndex === index ? { ...work, imageUrl } : work));
    } catch {
      setUploadError(text.uploadError);
    } finally {
      setUploadingId(null);
    }
  };

  return <section className="beauty-workspace-content-editor">
    <header><div><h2>{text.title}</h2><p>{text.hint}</p></div><span>{text.required}: 5 + 1</span></header>
    <nav className="beauty-workspace-content-tabs" aria-label={text.title}>{(["profile", "portfolio", "prices"] as Tab[]).map((item) => <button type="button" key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{text[item]}</button>)}</nav>
    <div className="beauty-workspace-language-tabs" aria-label="Content language">{beautyContentLanguages.map((item) => <button type="button" key={item} className={contentLanguage === item ? "is-active" : ""} onClick={() => setContentLanguage(item)}>{languageNames[item]}</button>)}</div>

    {tab === "profile" && <div className="beauty-workspace-content-grid">
      <label><span>{text.publicName}<b>{text.required}</b></span><input value={workspace.profile.displayName} onChange={(event) => updateProfile("displayName", event.target.value)} /></label>
      <label><span>{text.city}<b>{text.required}</b></span><input value={workspace.profile.city} onChange={(event) => updateProfile("city", event.target.value)} /></label>
      <label><span>{text.publicLocation}<b>{text.required}</b></span><input value={workspace.profile.publicLocation} onChange={(event) => updateProfile("publicLocation", event.target.value)} /></label>
      <label><span>{text.contact}<b>{text.required}</b></span><input value={workspace.profile.contact} onChange={(event) => updateProfile("contact", event.target.value)} /></label>
      <label className="is-wide"><span>{text.exactAddress}<b>{text.required}</b></span><input value={workspace.profile.exactAddress} onChange={(event) => updateProfile("exactAddress", event.target.value)} /></label>
      <label className="is-wide"><span>{text.instagram}<i>{text.optional}</i></span><input type="url" inputMode="url" placeholder="https://instagram.com/..." value={workspace.profile.instagramUrl} onChange={(event) => updateProfile("instagramUrl", event.target.value)} /></label>
      {profileFields.map((field) => <label className="is-wide" key={field.key}><span>{text[field.label]}<i>{text.optional}</i></span><textarea rows={field.rows} value={workspace.profile[field.key][contentLanguage]} onChange={(event) => updateProfileText(field.key, event.target.value)} /></label>)}
    </div>}

    {tab === "portfolio" && <div className="beauty-workspace-portfolio-editor">
      <p>{text.portfolioHint}<small>{text.uploadTypeHint}</small></p>
      {uploadError && <div className="beauty-workspace-upload-error" role="alert">{uploadError}</div>}
      {visiblePortfolio.map((item, index) => <article key={item.id}>
        <div className="beauty-workspace-portfolio-preview">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <ImagePlus />}</div>
        <div>
          <label className="beauty-workspace-upload-button"><Upload />{uploadingId === item.id ? text.uploading : text.uploadPhoto}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploadingId)} onChange={(event) => { void uploadPhoto(index, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
          <label><span>{text.imageUrl}<i>{text.optional}</i></span><input type="url" inputMode="url" value={item.imageUrl} onChange={(event) => updatePortfolio(visiblePortfolio.map((work, itemIndex) => itemIndex === index ? { ...work, imageUrl: event.target.value } : work))} /></label>
          <label><span>{text.imageAlt} · {languageNames[contentLanguage]}</span><input value={item.altByLanguage[contentLanguage]} onChange={(event) => updatePortfolio(visiblePortfolio.map((work, itemIndex) => itemIndex === index ? { ...work, altByLanguage: { ...work.altByLanguage, [contentLanguage]: event.target.value } } : work))} /></label>
          <div className="beauty-workspace-row-actions">
            <button type="button" disabled={index === 0} onClick={() => updatePortfolio(move(visiblePortfolio, index, -1))}><ArrowUp /></button>
            <button type="button" disabled={index === visiblePortfolio.length - 1} onClick={() => updatePortfolio(move(visiblePortfolio, index, 1))}><ArrowDown /></button>
            {item.imageUrl && <button type="button" onClick={() => window.open(item.imageUrl, "_blank", "noopener,noreferrer")}><ExternalLink />{text.open}</button>}
            <button type="button" className="danger" onClick={() => updatePortfolio(visiblePortfolio.filter((_, itemIndex) => itemIndex !== index))}><Trash2 />{text.remove}</button>
          </div>
        </div>
      </article>)}
      <button className="beauty-workspace-add-button" type="button" disabled={portfolioLimitReached} title={portfolioLimitReached ? text.limitReached : text.addWork} onClick={() => updatePortfolio([...visiblePortfolio, createBeautyPortfolioItem(visiblePortfolio.length)])}><Plus />{portfolioLimitReached ? text.limitReached : text.addWork}</button>
    </div>}

    {tab === "prices" && <div className="beauty-workspace-price-editor">
      <p>{text.pricesHint}</p>
      {workspace.services.map((service, index) => <article key={service.id}>
        <header><label className="beauty-workspace-active-toggle"><input type="checkbox" checked={service.active} onChange={(event) => updateService(index, { active: event.target.checked })} /><span>{text.active}</span></label><div className="beauty-workspace-row-actions"><button type="button" disabled={index === 0} onClick={() => updateServices(move(workspace.services, index, -1))}><ArrowUp /></button><button type="button" disabled={index === workspace.services.length - 1} onClick={() => updateServices(move(workspace.services, index, 1))}><ArrowDown /></button><button type="button" className="danger" disabled={workspace.services.length <= 1} title={workspace.services.length <= 1 ? text.cannotRemove : text.remove} onClick={() => removeService(index)}><Trash2 />{text.remove}</button></div></header>
        <div className="beauty-workspace-service-grid">
          <label className="is-wide"><span>{specializationText.label}<b>{text.required}</b></span><select value={service.specialization} onChange={(event) => updateService(index, { specialization: event.target.value as BeautyServiceSpecialization })}>{beautyServiceSpecializations.map((item) => <option value={item} key={item}>{specializationText.options[item]}</option>)}</select><small className="beauty-workspace-field-hint">{specializationText.hint}</small></label>
          <label className="is-wide"><span>{text.serviceName} · {languageNames[contentLanguage]}<b>{text.required}</b></span><input value={service.nameByLanguage[contentLanguage]} onChange={(event) => { const nameByLanguage = { ...service.nameByLanguage, [contentLanguage]: event.target.value }; updateService(index, { nameByLanguage, name: resolveBeautyLocalizedText(nameByLanguage, language, "") }); }} /></label>
          <label><span>{text.duration}<b>{text.required}</b></span><input type="number" min="5" max="480" value={service.durationMinutes} onChange={(event) => updateService(index, { durationMinutes: Number(event.target.value) })} /></label>
          <label><span>{text.price}<b>{text.required}</b></span><input type="number" min="0" max="100000" value={service.priceCzk} onChange={(event) => updateService(index, { priceCzk: Number(event.target.value) })} /></label>
          <label><span>{text.buffer}<i>{text.optional}</i></span><input type="number" min="0" max="240" value={service.bufferMinutes} onChange={(event) => updateService(index, { bufferMinutes: Number(event.target.value) })} /></label>
        </div>
      </article>)}
      <button className="beauty-workspace-add-button" type="button" onClick={addService}><Plus />{text.addService}</button>
    </div>}
  </section>;
}
