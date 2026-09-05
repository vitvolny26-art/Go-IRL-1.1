import type { UserLanguage } from "../userLanguage.js";
import type { ReminderAction, ReminderDelivery, ReminderMessage } from "./types.js";

const copy: Record<UserLanguage, {
  heading: (minutes: number) => string;
  open: string;
  calendar: string;
  map: string;
}> = {
  ru: { heading: (m) => m === 1440 ? "Событие уже завтра" : `Событие начнётся через ${m < 60 ? `${m} мин` : `${m / 60} ч`}`, open: "Открыть событие", calendar: "В календарь", map: "Открыть карту" },
  uk: { heading: (m) => m === 1440 ? "Подія вже завтра" : `Подія почнеться через ${m < 60 ? `${m} хв` : `${m / 60} год`}`, open: "Відкрити подію", calendar: "У календар", map: "Відкрити мапу" },
  cs: { heading: (m) => m === 1440 ? "Událost je už zítra" : `Událost začne za ${m < 60 ? `${m} min` : `${m / 60} h`}`, open: "Otevřít událost", calendar: "Do kalendáře", map: "Otevřít mapu" },
  en: { heading: (m) => m === 1440 ? "Your event is tomorrow" : `Your event starts in ${m < 60 ? `${m} min` : `${m / 60} hr`}`, open: "Open event", calendar: "Add to calendar", map: "Open map" },
  pl: { heading: (m) => m === 1440 ? "Wydarzenie jest już jutro" : `Wydarzenie zacznie się za ${m < 60 ? `${m} min` : `${m / 60} godz.`}`, open: "Otwórz wydarzenie", calendar: "Dodaj do kalendarza", map: "Otwórz mapę" },
  sk: { heading: (m) => m === 1440 ? "Udalosť je už zajtra" : `Udalosť sa začne o ${m < 60 ? `${m} min` : `${m / 60} h`}`, open: "Otvoriť udalosť", calendar: "Pridať do kalendára", map: "Otvoriť mapu" },
};

const buildActions = (delivery: ReminderDelivery): ReminderAction[] => {
  const labels = copy[delivery.language];
  return [
    { kind: "open", label: labels.open, url: delivery.event.openUrl },
    ...(delivery.event.calendarUrl ? [{ kind: "calendar" as const, label: labels.calendar, url: delivery.event.calendarUrl }] : []),
    ...(delivery.event.mapUrl ? [{ kind: "map" as const, label: labels.map, url: delivery.event.mapUrl }] : []),
  ];
};

export function buildReminderMessage(delivery: ReminderDelivery): ReminderMessage {
  const labels = copy[delivery.language];
  return {
    heading: labels.heading(delivery.leadMinutes),
    body: [delivery.event.title, delivery.event.dateTime, delivery.event.location].filter(Boolean).join("\n"),
    actions: buildActions(delivery),
  };
}

export function isSafeReminderActionUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function validateReminderMessage(message: ReminderMessage) {
  return message.heading.trim().length > 0
    && message.body.trim().length > 0
    && message.actions.length >= 1
    && message.actions.every((action) => action.label.trim().length > 0 && isSafeReminderActionUrl(action.url));
}
