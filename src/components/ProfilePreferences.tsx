import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, MapPin, Share2 } from "lucide-react";
import { CommunicationPreferencePanel } from "../communications/CommunicationPreferencePanel";
import { visiblePreferenceOptions, type PreferenceOption } from "../profilePreferenceOptions";
import {
  readUserPreferences,
  updateUserPreferences,
  type CalendarProvider,
  type MapProvider,
  type ShareProvider,
  type UserPreferences,
} from "../userPreferences";
import type { Language } from "../types";

const copy: Record<Language, {
  title: string;
  hint: string;
  automatic: string;
  maps: string;
  calendar: string;
  share: string;
}> = {
  ru: { title: "Предпочтения", hint: "Выберите приложения по умолчанию и канал для оповещений.", automatic: "Спрашивать каждый раз", maps: "Карты", calendar: "Календарь", share: "Поделиться" },
  uk: { title: "Налаштування", hint: "Оберіть програми за замовчуванням і канал для сповіщень.", automatic: "Запитувати щоразу", maps: "Карти", calendar: "Календар", share: "Поділитися" },
  cs: { title: "Předvolby", hint: "Vyberte výchozí aplikace a kanál pro oznámení.", automatic: "Vždy se zeptat", maps: "Mapy", calendar: "Kalendář", share: "Sdílení" },
  en: { title: "Preferences", hint: "Choose default apps and your notification channel.", automatic: "Ask every time", maps: "Maps", calendar: "Calendar", share: "Share" },
  pl: { title: "Preferences", hint: "Choose default apps and your notification channel.", automatic: "Ask every time", maps: "Maps", calendar: "Calendar", share: "Share" },
  sk: { title: "Předvolby", hint: "Vyberte výchozí aplikace a kanál pro oznámení.", automatic: "Vždy se zeptat", maps: "Mapy", calendar: "Kalendář", share: "Sdílení" },
};

const mapOptions: Array<{ value: MapProvider; label: string }> = [
  { value: "google", label: "Google Maps" },
  { value: "apple", label: "Apple Maps" },
  { value: "mapy", label: "Mapy.com" },
];
const calendarOptions: Array<{ value: CalendarProvider; label: string }> = [
  { value: "google", label: "Google Calendar" },
  { value: "apple", label: "Apple Calendar" },
  { value: "outlook", label: "Outlook" },
];
const shareOptions: Array<{ value: ShareProvider; label: string; disabled?: boolean }> = [
  { value: "telegram", label: "Telegram" },
  { value: "messenger", label: "Messenger" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram", disabled: true },
];

type PreferenceKey = "mapProvider" | "calendarProvider" | "shareProvider";

type PreferenceRowProps = {
  icon: ReactNode;
  label: string;
  value: string | null | undefined;
  options: PreferenceOption[];
  automatic: string;
  onChange: (value: string | null) => void;
};

function PreferenceRow({ icon, label, value, options, automatic, onChange }: PreferenceRowProps) {
  const visibleOptions = visiblePreferenceOptions(options);
  const normalizedValue = visibleOptions.some((option) => option.value === value) ? value : "";

  return (
    <label className="profile-preference-row">
      <span className="profile-preference-icon">{icon}</span>
      <span className="profile-preference-copy"><strong>{label}</strong></span>
      <span className="profile-preference-select">
        <select aria-label={label} value={normalizedValue || ""} onChange={(event) => onChange(event.target.value || null)}>
          <option value="">{automatic}</option>
          {visibleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" />
      </span>
    </label>
  );
}

export function ProfilePreferences({ language }: { language: Language }) {
  const [preferences, setPreferences] = useState<UserPreferences>(() => readUserPreferences());

  useEffect(() => {
    const refresh = () => setPreferences(readUserPreferences());
    window.addEventListener("storage", refresh);
    window.addEventListener("go-irl-user-preferences-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("go-irl-user-preferences-changed", refresh);
    };
  }, []);

  const labels = copy[language];
  const change = (key: PreferenceKey, value: string | null) => {
    setPreferences(updateUserPreferences({ [key]: value } as Partial<UserPreferences>));
  };

  return (
    <section className="profile-preferences" aria-labelledby="profile-preferences-title">
      <header><h2 id="profile-preferences-title">{labels.title}</h2><p>{labels.hint}</p></header>
      <div className="profile-preferences-list">
        <PreferenceRow icon={<MapPin />} label={labels.maps} value={preferences.mapProvider} options={mapOptions} automatic={labels.automatic} onChange={(value) => change("mapProvider", value)} />
        <PreferenceRow icon={<CalendarDays />} label={labels.calendar} value={preferences.calendarProvider} options={calendarOptions} automatic={labels.automatic} onChange={(value) => change("calendarProvider", value)} />
        <PreferenceRow icon={<Share2 />} label={labels.share} value={preferences.shareProvider} options={shareOptions} automatic={labels.automatic} onChange={(value) => change("shareProvider", value)} />
        <CommunicationPreferencePanel language={language} audience="user" allowedChannels={["telegram", "in_app"]} />
      </div>
    </section>
  );
}
