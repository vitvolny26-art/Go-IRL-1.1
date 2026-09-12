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

export const buildOrganizerJoinAlertText = (delivery: EventNotificationDelivery) => copy[delivery.language](
  delivery.payload.participantName || "GO IRL",
  Math.max(0, delivery.payload.joinedCount || 0),
  delivery.payload.capacity && delivery.payload.capacity > 0 ? delivery.payload.capacity : null,
);
