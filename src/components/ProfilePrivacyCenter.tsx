import { Download, Eye, EyeOff, FileText, ShieldCheck, Trash2 } from "lucide-react";
import type { AccountRequestKind, AccountRequestResult } from "../accountRequest";
import type { Language } from "../types";

export type ProfilePrivacySnapshot = {
  displayName: string;
  bio: string;
  cityLabel: string;
  avatar: string;
  isPublic: boolean;
  showFavorites: boolean;
  favoriteLabels: string[];
};

type Props = {
  language: Language;
  snapshot: ProfilePrivacySnapshot;
  saving: boolean;
  accountRequestPending: AccountRequestKind | null;
  accountRequestResult: AccountRequestResult | null;
  onChange: (next: Pick<ProfilePrivacySnapshot, "isPublic" | "showFavorites">) => void;
  onAccountRequest: (kind: AccountRequestKind) => void;
};

const copy: Record<Language, {
  title: string; hint: string; publicProfile: string; publicHint: string; favorites: string; favoritesHint: string;
  preview: string; hidden: string; notice: string; terms: string; rights: string; rightsHint: string; adult: string;
  exportData: string; deleteAccount: string; requesting: string; unavailable: string; failed: string; submitted: string; reference: string;
}> = {
  ru: { title: "Приватность и безопасность", hint: "Управляйте тем, что видно другим участникам.", publicProfile: "Публичный профиль", publicHint: "Имя, фото, город и короткое описание могут отображаться в событиях.", favorites: "Показывать избранные интересы", favoritesHint: "Личная цель и скрытые интересы никогда не публикуются.", preview: "Публичный предпросмотр", hidden: "Профиль скрыт", notice: "Уведомление о конфиденциальности", terms: "Условия использования", rights: "Запросы по данным", rightsHint: "Экспорт данных и удаление аккаунта проходят только через подтверждённый backend-запрос.", adult: "GO IRL предназначен для пользователей 18+. Возраст указывается пользователем самостоятельно и не считается проверенным.", exportData: "Запросить экспорт данных", deleteAccount: "Запросить удаление аккаунта", requesting: "Отправка запроса…", unavailable: "Backend для этого запроса пока недоступен. Ничего не отправлено.", failed: "Запрос не подтверждён backend. Повторите позже.", submitted: "Запрос принят backend.", reference: "Код обращения" },
  uk: { title: "Приватність і безпека", hint: "Керуйте тим, що бачать інші учасники.", publicProfile: "Публічний профіль", publicHint: "Ім’я, фото, місто та короткий опис можуть відображатися у подіях.", favorites: "Показувати улюблені інтереси", favoritesHint: "Приватна мета та приховані інтереси ніколи не публікуються.", preview: "Публічний перегляд", hidden: "Профіль приховано", notice: "Повідомлення про конфіденційність", terms: "Умови використання", rights: "Запити щодо даних", rightsHint: "Експорт даних і видалення акаунта виконуються лише через підтверджений backend-запит.", adult: "GO IRL призначений для користувачів 18+. Вік вказується користувачем самостійно і не вважається перевіреним.", exportData: "Запросити експорт даних", deleteAccount: "Запросити видалення акаунта", requesting: "Надсилання запиту…", unavailable: "Backend для цього запиту поки недоступний. Нічого не надіслано.", failed: "Запит не підтверджено backend. Спробуйте пізніше.", submitted: "Запит прийнято backend.", reference: "Код звернення" },
  cs: { title: "Soukromí a bezpečnost", hint: "Spravujte, co uvidí ostatní účastníci.", publicProfile: "Veřejný profil", publicHint: "Jméno, fotka, město a krátký popis se mohou zobrazit u událostí.", favorites: "Zobrazit oblíbené zájmy", favoritesHint: "Soukromý cíl a skryté zájmy se nikdy nezveřejňují.", preview: "Veřejný náhled", hidden: "Profil je skrytý", notice: "Oznámení o ochraně soukromí", terms: "Podmínky používání", rights: "Žádosti o údaje", rightsHint: "Export dat a odstranění účtu probíhá pouze přes potvrzený backendový požadavek.", adult: "GO IRL je určeno uživatelům 18+. Věk uvádí uživatel sám a není považován za ověřený.", exportData: "Požádat o export dat", deleteAccount: "Požádat o odstranění účtu", requesting: "Odesílání požadavku…", unavailable: "Backend pro tento požadavek zatím není dostupný. Nic nebylo odesláno.", failed: "Backend požadavek nepotvrdil. Zkuste to později.", submitted: "Backend požadavek přijal.", reference: "Kód požadavku" },
  en: { title: "Privacy and safety", hint: "Control what other participants can see.", publicProfile: "Public profile", publicHint: "Your name, photo, city and short bio may appear around events.", favorites: "Show favorite interests", favoritesHint: "Private goals and hidden interests are never published.", preview: "Public preview", hidden: "Profile hidden", notice: "Privacy Notice", terms: "Terms of Use", rights: "Data rights requests", rightsHint: "Data export and account deletion proceed only through a backend-confirmed request.", adult: "GO IRL is for users 18+. Age is self-declared and is not treated as verified.", exportData: "Request data export", deleteAccount: "Request account deletion", requesting: "Submitting request…", unavailable: "The backend for this request is not available yet. Nothing was submitted.", failed: "The backend did not confirm this request. Try again later.", submitted: "The backend accepted the request.", reference: "Request reference" },
};

const isImageAvatar = (value: string) => value.startsWith("data:image/") || /^https?:\/\//.test(value);

const accountRequestMessage = (labels: typeof copy.en, result: AccountRequestResult) => {
  if (result.status === "submitted") return `${labels.submitted} ${labels.reference}: ${result.requestId}.`;
  if (result.status === "unavailable") return `${labels.unavailable} ${labels.reference}: ${result.correlationId}.`;
  return `${labels.failed} ${labels.reference}: ${result.correlationId}.`;
};

export function ProfilePrivacyCenter({ language, snapshot, saving, accountRequestPending, accountRequestResult, onChange, onAccountRequest }: Props) {
  const labels = copy[language];
  const accountRequestBusy = accountRequestPending !== null;
  return (
    <section className="profile-privacy-center" aria-labelledby="profile-privacy-title">
      <header><h2 id="profile-privacy-title">{labels.title}</h2><p>{labels.hint}</p></header>
      <label className="profile-privacy-toggle"><span>{snapshot.isPublic ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}</span><span><strong>{labels.publicProfile}</strong><small>{labels.publicHint}</small></span><input type="checkbox" checked={snapshot.isPublic} disabled={saving} onChange={(event) => onChange({ isPublic: event.target.checked, showFavorites: snapshot.showFavorites })} /></label>
      <label className="profile-privacy-toggle"><span><ShieldCheck aria-hidden="true" /></span><span><strong>{labels.favorites}</strong><small>{labels.favoritesHint}</small></span><input type="checkbox" checked={snapshot.showFavorites} disabled={saving || !snapshot.isPublic} onChange={(event) => onChange({ isPublic: snapshot.isPublic, showFavorites: event.target.checked })} /></label>
      <section className="profile-public-preview" aria-label={labels.preview}><h3>{labels.preview}</h3>{snapshot.isPublic ? <div><span className="profile-public-preview-avatar">{isImageAvatar(snapshot.avatar) ? <img src={snapshot.avatar} alt="" /> : snapshot.avatar}</span><strong>{snapshot.displayName}</strong><small>{snapshot.cityLabel}</small><p>{snapshot.bio}</p>{snapshot.showFavorites && snapshot.favoriteLabels.length > 0 ? <div className="profile-interest-list">{snapshot.favoriteLabels.map((label) => <span key={label}>{label}</span>)}</div> : null}</div> : <p>{labels.hidden}</p>}</section>
      <div className="profile-privacy-links"><a href="/privacy" target="_blank" rel="noreferrer"><FileText aria-hidden="true" />{labels.notice}</a><a href="/terms.html" target="_blank" rel="noreferrer"><FileText aria-hidden="true" />{labels.terms}</a></div>
      <section className="profile-rights-status">
        <h3>{labels.rights}</h3>
        <p>{labels.rightsHint}</p>
        <div className="profile-rights-actions">
          <button type="button" disabled={accountRequestBusy} onClick={() => onAccountRequest("data_export")}><Download aria-hidden="true" />{accountRequestPending === "data_export" ? labels.requesting : labels.exportData}</button>
          <button type="button" className="is-danger" disabled={accountRequestBusy} onClick={() => onAccountRequest("account_deletion")}><Trash2 aria-hidden="true" />{accountRequestPending === "account_deletion" ? labels.requesting : labels.deleteAccount}</button>
        </div>
        {accountRequestResult ? <p className="profile-rights-result" role="status">{accountRequestMessage(labels, accountRequestResult)}</p> : null}
      </section>
      <p className="profile-age-notice">{labels.adult}</p>
    </section>
  );
}
