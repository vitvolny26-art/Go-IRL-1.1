import type { TelegramEventCardInput } from "./telegram-event-card.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const languages = new Set(["ru", "uk", "cs", "en", "pl", "sk"]);

const stringValue = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const safeInviteUrl = (value: unknown, eventId: string) => {
  if (typeof value !== "string" || value.length > 500) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "t.me" && url.searchParams.get("startapp") === eventId
      ? value
      : "";
  } catch {
    return "";
  }
};

const safeMapUrl = (value: unknown) => {
  if (typeof value !== "string" || !value || value.length > 500) return undefined;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase();
    return url.protocol === "https:" && (
      hostname === "mapy.cz"
      || hostname.endsWith(".mapy.cz")
      || hostname === "maps.app.goo.gl"
      || hostname === "google.com"
      || hostname.endsWith(".google.com")
    ) ? value : undefined;
  } catch {
    return undefined;
  }
};

const safeTelegramAvatarUrl = (value) => {
  const raw = stringValue(value, 500);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLocaleLowerCase();
    const hosts = ["t.me", "telegram.org", "telegram-cdn.org"];
    return url.protocol === "https:"
      && hosts.some((host) => hostname === host || hostname.endsWith("." + host))
      ? raw
      : undefined;
  } catch {
    return undefined;
  }
};

const weatherValue = (value: unknown): TelegramEventCardInput["weather"] => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const temperature = numberValue(raw.temperature, Number.NaN);
  const rain = numberValue(raw.rain, Number.NaN);
  const wind = numberValue(raw.wind, Number.NaN);
  if (![temperature, rain, wind].every(Number.isFinite)) return undefined;
  return {
    icon: stringValue(raw.icon, 12) || "🌤️",
    temperature: clamp(temperature, -80, 80),
    rain: clamp(rain, 0, 100),
    wind: clamp(wind, 0, 300),
  };
};

export function normalizeTelegramEventCardInput(value: unknown): TelegramEventCardInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const eventId = stringValue(raw.eventId, 64);
  const language = stringValue(raw.language, 2);
  const inviteUrl = safeInviteUrl(raw.inviteUrl, eventId);
  if (!uuidPattern.test(eventId) || !languages.has(language) || !inviteUrl) return null;

  const duration = numberValue(raw.durationMinutes, Number.NaN);
  return {
    eventId,
    title: stringValue(raw.title, 240),
    activity: stringValue(raw.activity, 240),
    date: stringValue(raw.date, 40),
    eventDate: stringValue(raw.eventDate, 10),
    time: stringValue(raw.time, 20),
    address: stringValue(raw.address, 300),
    participants: Math.trunc(clamp(numberValue(raw.participants), 0, 100_000)),
    capacity: Math.trunc(clamp(numberValue(raw.capacity), 0, 100_000)),
    icon: stringValue(raw.icon, 24),
    inviteUrl,
    mapUrl: safeMapUrl(raw.mapUrl),
    city: stringValue(raw.city, 100),
    organizer: stringValue(raw.organizer, 120) || undefined,
    organizerKey: stringValue(raw.organizerKey, 160) || undefined,
    organizerAvatarUrl: safeTelegramAvatarUrl(raw.organizerAvatarUrl),
    durationMinutes: Number.isFinite(duration) ? Math.round(clamp(duration, 15, 480)) : undefined,
    price: clamp(numberValue(raw.price), 0, 100_000),
    level: stringValue(raw.level, 80),
    format: stringValue(raw.format, 80),
    environment: stringValue(raw.environment, 80),
    isSport: raw.isSport === true,
    weather: weatherValue(raw.weather),
    language: language as TelegramEventCardInput["language"],
  };
}
