import type { UserLanguage } from "../userLanguage.js";
import type { EventNotificationDelivery } from "./types.js";

const copy: Record<UserLanguage, (name: string, joined: number, capacity: number | null) => string> = {
  ru: (name, joined, capacity) => `👋 Новый участник: ${name}\nУчастники: ${joined}${capacity ? `/${capacity}` : ""}`,
  uk: (name, joined, capacity) => `👋 Новий учасник: ${name}\nУчасники: ${joined}${capacity ? `/${capacity}` : ""}`,
  cs: (name, joined, capacity) => `👋 Nový účastník: ${name}\nÚčastníci: ${joined}${capacity ? `/${capacity}` : ""}`,
  en: (name, joined, capacity) => `👋 New participant: ${name}\nParticipants: ${joined}${capacity ? `/${capacity}` : ""}`,
  pl: (name, joined, capacity) => `👋 Nowa osoba dołączyła: ${name}\nUczestnicy: ${joined}${capacity ? `/${capacity}` : ""}`,
  sk: (name, joined, capacity) => `👋 Nový účastník: ${name}\nÚčastníci: ${joined}${capacity ? `/${capacity}` : ""}`,
};

const rosterLabel: Record<UserLanguage, string> = {
  ru: "Список участников", uk: "Список учасників", cs: "Seznam účastníků",
  en: "Participant list", pl: "Lista uczestników", sk: "Zoznam účastníkov",
};

const unnamedParticipant: Record<UserLanguage, string> = {
  ru: "Имя не указано", uk: "Ім’я не вказано", cs: "Bez jména",
  en: "Name unavailable", pl: "Bez imienia", sk: "Bez mena",
};

export const buildOrganizerJoinAlertText = (delivery: EventNotificationDelivery) => {
  const message = copy[delivery.language](
  delivery.payload.participantName?.trim() || unnamedParticipant[delivery.language],
  Math.max(0, delivery.payload.joinedCount || 0),
  delivery.payload.capacity && delivery.payload.capacity > 0 ? delivery.payload.capacity : null,
  );
  const names = delivery.payload.participantNames;
  if (!Array.isArray(names)) return message;
  const safeNames = names.filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  return `${message}\n${rosterLabel[delivery.language]}:\n${safeNames.map((name, index) => `${index + 1}. ${name.trim()}`).join("\n") || "—"}`;
};
