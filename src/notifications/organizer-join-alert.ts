import type { UserLanguage } from "../userLanguage.js";
import type { EventNotificationDelivery } from "./types.js";

const copy: Record<UserLanguage, (name: string, joined: number, capacity: number | null) => string> = {
  ru: (name, joined, capacity) => `👋 ${name} присоединился(-ась) к событию.\nУчастники: ${joined}${capacity ? `/${capacity}` : ""}`,
  uk: (name, joined, capacity) => `👋 ${name} приєднався(-лася) до події.\nУчасники: ${joined}${capacity ? `/${capacity}` : ""}`,
  cs: (name, joined, capacity) => `👋 ${name} se přidal(a) k události.\nÚčastníci: ${joined}${capacity ? `/${capacity}` : ""}`,
  en: (name, joined, capacity) => `👋 ${name} joined your event.\nParticipants: ${joined}${capacity ? `/${capacity}` : ""}`,
  pl: (name, joined, capacity) => `👋 ${name} dołączył(a) do wydarzenia.\nUczestnicy: ${joined}${capacity ? `/${capacity}` : ""}`,
  sk: (name, joined, capacity) => `👋 ${name} sa pridal(a) k udalosti.\nÚčastníci: ${joined}${capacity ? `/${capacity}` : ""}`,
};

const rosterLabel: Record<UserLanguage, string> = {
  ru: "Список участников", uk: "Список учасників", cs: "Seznam účastníků",
  en: "Participant list", pl: "Lista uczestników", sk: "Zoznam účastníkov",
};

export const buildOrganizerJoinAlertText = (delivery: EventNotificationDelivery) => {
  const message = copy[delivery.language](
  delivery.payload.participantName || "GO IRL",
  Math.max(0, delivery.payload.joinedCount || 0),
  delivery.payload.capacity && delivery.payload.capacity > 0 ? delivery.payload.capacity : null,
  );
  const names = delivery.payload.participantNames;
  if (!Array.isArray(names)) return message;
  const safeNames = names.filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  return `${message}\\n${rosterLabel[delivery.language]}:\\n${safeNames.map((name, index) => `${index + 1}. ${name.trim()}`).join("\\n") || "—"}`;
};
