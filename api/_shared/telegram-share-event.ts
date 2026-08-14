import { createClient } from "@supabase/supabase-js";
import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { readEnv } from "./env.js";
import { loadTelegramShareWeather } from "./telegram-share-weather.js";

export type ShareLanguage = "ru" | "uk" | "cs" | "en";

const OFFICIAL_BOT_USERNAME = "GOirl_bot";
const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isShareEventId = (value: unknown): value is string =>
  typeof value === "string" && EVENT_ID_PATTERN.test(value.trim());

export const isShareLanguage = (value: unknown): value is ShareLanguage =>
  value === "ru" || value === "uk" || value === "cs" || value === "en";

export const buildOfficialInviteUrl = (eventId: string) =>
  `https://t.me/${OFFICIAL_BOT_USERNAME}?startapp=${encodeURIComponent(eventId)}`;

type ActivityRow = {
  id: string;
  activity_ru: string;
  activity_cs: string;
  title_ru: string;
  title_cs: string;
  event_date: string;
  event_time: string;
  city_id: string;
  address: string;
  location_url: string | null;
  activity_type: string;
  metadata: Record<string, unknown> | null;
  price: number;
  capacity: number;
  organizer: string;
  organizer_key: string;
  visibility: "public" | "invite" | "private";
};

export const isShareableEventVisibility = (visibility: ActivityRow["visibility"]) =>
  visibility === "public" || visibility === "invite";

export const isIndexableEventVisibility = (visibility: ActivityRow["visibility"]) =>
  visibility === "public";

export type TrustedTelegramEventCard = TelegramEventCardInput & {
  visibility: ActivityRow["visibility"];
};

export const resolveShareEventDatabaseConfig = (env = readEnv) => {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url) throw new Error("missing_environment:SUPABASE_URL");
  if (!key) throw new Error("missing_environment:SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
};

const client = () => {
  const config = resolveShareEventDatabaseConfig();
  return createClient(
  config.url,
  config.key,
  { auth: { persistSession: false, autoRefreshToken: false } },
  );
};

const localized = (row: ActivityRow, language: ShareLanguage, field: "activity" | "title") => {
  const ru = field === "activity" ? row.activity_ru : row.title_ru;
  const cs = field === "activity" ? row.activity_cs : row.title_cs;
  return language === "cs" ? cs : ru;
};

const iconFor = (activity: string) => {
  const value = activity.toLocaleLowerCase();
  if (value.includes("волейбол") || value.includes("volejbal") || value.includes("volleyball")) return "🏐";
  if (value.includes("ролик") || value.includes("brusl") || value.includes("skating")) return "🛼";
  if (value.includes("футбол") || value.includes("fotbal") || value.includes("football")) return "⚽";
  if (value.includes("баскет") || value.includes("basket")) return "🏀";
  if (value.includes("теннис") || value.includes("tenis") || value.includes("tennis")) return "🎾";
  return "✨";
};

const cityName = (cityId: string, language: ShareLanguage) => {
  if (cityId === "olomouc") return language === "cs" ? "Olomouc" : "Оломоуц";
  return cityId;
};

const compactDate = (value: string, language: ShareLanguage) => {
  const locale = language === "cs" ? "cs-CZ" : language === "uk" ? "uk-UA" : language === "en" ? "en-GB" : "ru-RU";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" })
    .format(date)
    .replace(/\.$/, "");
};

const sportMetadata = (metadata: Record<string, unknown> | null) => {
  const sport = metadata?.sport;
  return sport && typeof sport === "object" ? sport as Record<string, unknown> : null;
};

const text = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
const number = (value: unknown, fallback: number) => Number.isFinite(value) ? Number(value) : fallback;

const sportValueCopy = {
  ru: {
    beginner: "Начальный",
    intermediate: "Любитель",
    advanced: "Продвинутый",
    casual: "Любительский",
    competitive: "Соревновательный",
    indoor: "В помещении",
    outdoor: "На улице",
  },
  uk: {
    beginner: "Початковий",
    intermediate: "Аматор",
    advanced: "Просунутий",
    casual: "Аматорський",
    competitive: "Змагальний",
    indoor: "У приміщенні",
    outdoor: "Надворі",
  },
  cs: {
    beginner: "Začátečník",
    intermediate: "Pokročilý",
    advanced: "Expert",
    casual: "Rekreační",
    competitive: "Soutěžní",
    indoor: "Uvnitř",
    outdoor: "Venku",
  },
  en: {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
    casual: "Casual",
    competitive: "Competitive",
    indoor: "Indoor",
    outdoor: "Outdoor",
  },
} as const;

const localizedSportValue = (
  value: unknown,
  language: ShareLanguage,
  fallback: string,
) => {
  const raw = text(value, fallback);
  const key = raw.toLocaleLowerCase() as keyof typeof sportValueCopy.en;
  return sportValueCopy[language][key] || raw;
};

export async function loadTrustedTelegramEventCard(eventId: string, language: ShareLanguage): Promise<TrustedTelegramEventCard | null> {
  const db = client();
  const { data, error } = await db
    .from("activities")
    .select("id,activity_ru,activity_cs,title_ru,title_cs,event_date,event_time,city_id,address,location_url,activity_type,metadata,price,capacity,organizer,organizer_key,visibility")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as ActivityRow;
  if (!isShareableEventVisibility(row.visibility)) return null;
  const activity = localized(row, language, "activity");
  const sport = sportMetadata(row.metadata);
  const weatherPromise = loadTelegramShareWeather({
    eventDate: row.event_date,
    time: row.event_time.slice(0, 5),
    cityId: row.city_id,
    activity,
    environment: sport?.environment,
  });

  const { count, error: countError } = await db
    .from("activity_members")
    .select("activity_id", { count: "exact", head: true })
    .eq("activity_id", eventId)
    .eq("status", "joined");
  if (countError) throw countError;

  const profileResult = await db
    .from("user_profiles")
    .select("avatar_path")
    .eq("user_key", row.organizer_key)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;

  let organizerAvatarUrl: string | undefined;
  const avatarPath = typeof profileResult.data?.avatar_path === "string" ? profileResult.data.avatar_path.trim() : "";
  if (avatarPath) {
    const signed = await db.storage.from("avatars").createSignedUrl(avatarPath, 300);
    if (signed.error) throw signed.error;
    organizerAvatarUrl = signed.data.signedUrl;
  }

  const weather = await weatherPromise;
  const generic = language === "cs"
    ? { level: "Pro všechny", format: "Otevřené", environment: "Ve městě" }
    : language === "en"
      ? { level: "All levels", format: "Open", environment: "In the city" }
      : { level: "Для всех", format: "Открыто", environment: "В городе" };

  return {
    eventId: row.id,
    visibility: row.visibility,
    title: localized(row, language, "title"),
    activity,
    date: compactDate(row.event_date, language),
    eventDate: row.event_date,
    time: row.event_time.slice(0, 5),
    address: row.address,
    participants: count || 0,
    capacity: row.capacity,
    icon: iconFor(activity),
    inviteUrl: buildOfficialInviteUrl(row.id),
    mapUrl: row.location_url || undefined,
    city: cityName(row.city_id, language),
    organizer: row.organizer,
    organizerKey: row.organizer_key,
    organizerAvatarUrl,
    durationMinutes: number(sport?.durationMinutes, 90),
    price: row.price,
    level: localizedSportValue(sport?.level, language, generic.level),
    format: localizedSportValue(sport?.format, language, generic.format),
    environment: localizedSportValue(sport?.environment, language, generic.environment),
    isSport: row.activity_type === "sport" || Boolean(sport),
    weather: weather || undefined,
    language,
  };
}
