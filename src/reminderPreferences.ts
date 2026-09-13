export type ReminderChannel = "in_app" | "telegram" | "whatsapp" | "instagram" | "messenger";
export type ReminderLeadMinutes = 15 | 60 | 180 | 1440;

export type EventReminderPreference = {
  activityId: string;
  channel: ReminderChannel;
  leadMinutes: ReminderLeadMinutes;
  eventStartsAt: string;
  updatedAt: string;
};

const storageKey = "go-irl-event-reminders-v1";
export const eventReminderChangedEvent = "go-irl-event-reminder-changed";

const isPreference = (value: unknown): value is EventReminderPreference => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EventReminderPreference>;
  return typeof item.activityId === "string"
    && ["in_app", "telegram", "whatsapp", "instagram", "messenger"].includes(item.channel || "")
    && [15, 60, 180, 1440].includes(item.leadMinutes || 0)
    && typeof item.eventStartsAt === "string"
    && typeof item.updatedAt === "string";
};

const readCookieStorage = () => {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(storageKey)}=`;
  const entry = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  if (!entry) return null;
  try { return decodeURIComponent(entry.slice(prefix.length)); } catch { return null; }
};

const readStoredValue = () => {
  try {
    if (typeof localStorage !== "undefined") {
      const value = localStorage.getItem(storageKey);
      if (value) return value;
    }
  } catch { /* Telegram WebViews can deny localStorage. */ }
  return readCookieStorage();
};

const writeStoredValue = (value: string) => {
  let persisted = false;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey, value);
      persisted = true;
    }
  } catch { /* Keep cookie fallback. */ }
  if (typeof document !== "undefined") {
    try {
      document.cookie = `${encodeURIComponent(storageKey)}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      persisted = true;
    } catch { /* Keep in-memory UI state. */ }
  }
  return persisted;
};

const readAllPreferences = () => {
  try {
    const parsed: unknown = JSON.parse(readStoredValue() || "[]");
    return Array.isArray(parsed) ? parsed.filter(isPreference) : [];
  } catch { return []; }
};

export function readEventReminders(activityId: string) {
  return readAllPreferences()
    .filter((item) => item.activityId === activityId)
    .sort((a, b) => a.leadMinutes - b.leadMinutes);
}

export function readEventReminder(activityId: string) {
  return readEventReminders(activityId)[0] || null;
}

export function saveEventReminders(preferences: EventReminderPreference[]) {
  const activityId = preferences[0]?.activityId;
  if (!activityId) return false;
  const unique = Array.from(new Map(preferences.map((item) => [`${item.channel}:${item.leadMinutes}`, item])).values());
  const existing = readAllPreferences().filter((item) => item.activityId !== activityId);
  const persisted = writeStoredValue(JSON.stringify([...unique, ...existing]));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(eventReminderChangedEvent, { detail: { activityId, preferences: unique } }));
  }
  return persisted;
}

export function saveEventReminder(preference: EventReminderPreference) {
  return saveEventReminders([preference]);
}

export function removeEventReminder(activityId: string) {
  const persisted = writeStoredValue(JSON.stringify(readAllPreferences().filter((item) => item.activityId !== activityId)));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(eventReminderChangedEvent, { detail: { activityId } }));
  }
  return persisted;
}

export const eventStartsAt = (date: string, time: string) => `${date}T${time || "00:00"}${time?.split(":").length === 2 ? ":00" : ""}`;
