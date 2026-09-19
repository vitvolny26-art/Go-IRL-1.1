import { createClient } from "@supabase/supabase-js";
import { readEnv } from "./env.js";
import type { ShareLanguage } from "./telegram-share-event.js";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const publicAppFallbackOrigin = "https://go-irl.fun";
const telegramMiniAppOrigin = "https://t.me/GOirl_bot";
const cityPosterStartParam = (slug: string) => `city-poster-${slug}`;

export const isCityPostersShareSlug = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 160 && SLUG_PATTERN.test(value.trim());

const publicAppOrigin = () => (readEnv("GO_IRL_PUBLIC_ORIGIN")
  || readEnv("VITE_GO_IRL_PUBLIC_ORIGIN")
  || publicAppFallbackOrigin).replace(/\/+$/, "");

const dbClient = () => {
  const url = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url) throw new Error("missing_environment:SUPABASE_URL");
  if (!key) throw new Error("missing_environment:SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

const localeFor = (language: ShareLanguage) => ({
  ru: "ru-RU", uk: "uk-UA", cs: "cs-CZ", en: "en-GB", pl: "pl-PL", sk: "sk-SK",
} as const)[language];

const labels = {
  ru: { details: "Подробнее", plan: "Хочу пойти" },
  uk: { details: "Докладніше", plan: "Хочу піти" },
  cs: { details: "Podrobnosti", plan: "Chci jít" },
  en: { details: "Details", plan: "Want to go" },
  pl: { details: "Szczegóły", plan: "Chcę iść" },
  sk: { details: "Podrobnosti", plan: "Chcem ísť" },
} as const;

export type TrustedCityPostersShareCard = {
  eventId: string;
  canonicalSlug: string;
  title: string;
  description: string;
  date: string;
  venue: string;
  detailsUrl: string;
  appUrl: string;
  heroMediaUrl?: string;
  language: ShareLanguage;
};

export async function loadTrustedCityPostersShareCard(
  canonicalSlug: string,
  language: ShareLanguage,
): Promise<TrustedCityPostersShareCard | null> {
  const db = dbClient();
  const { data: event, error: eventError } = await db
    .from("city_posters_events")
    .select("id,canonical_slug,hero_media_url")
    .eq("canonical_slug", canonicalSlug)
    .eq("status", "published")
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) return null;

  const { data: translations, error: translationError } = await db
    .from("city_posters_event_translations")
    .select("language,title,description")
    .eq("event_id", event.id)
    .in("language", [language, "en", "ru", "cs"]);
  if (translationError) throw translationError;
  const translation = [language, "en", "ru", "cs"]
    .map((candidate) => translations?.find((item) => item.language === candidate))
    .find(Boolean);
  if (!translation) return null;

  const { data: occurrences, error: occurrenceError } = await db
    .from("city_posters_occurrences")
    .select("id,venue_id,starts_at,ends_at,timezone,occurrence_url,metadata")
    .eq("event_id", event.id)
    .in("status", ["scheduled", "postponed", "rescheduled"])
    .order("starts_at", { ascending: true })
    .limit(1);
  if (occurrenceError) throw occurrenceError;
  const occurrence = occurrences?.[0];
  if (!occurrence) return null;

  let venue = "";
  if (occurrence.venue_id) {
    const venueResult = await db
      .from("city_posters_venues")
      .select("canonical_name,address")
      .eq("id", occurrence.venue_id)
      .maybeSingle();
    if (venueResult.error) throw venueResult.error;
    venue = [venueResult.data?.canonical_name, venueResult.data?.address].filter(Boolean).join(" · ");
  }

  const startsAt = new Date(occurrence.starts_at);
  const endsAt = occurrence.ends_at ? new Date(occurrence.ends_at) : null;
  const timeZone = occurrence.timezone || "Europe/Prague";
  const isAllDay = occurrence.metadata?.allDay === true;
  let date = "";
  if (!Number.isNaN(startsAt.getTime())) {
    if (isAllDay && endsAt && !Number.isNaN(endsAt.getTime())) {
      const inclusiveEnd = new Date(endsAt.getTime() - 1);
      const dayMonth = new Intl.DateTimeFormat(localeFor(language), { day: "numeric", month: "long", timeZone });
      const dayOnly = new Intl.DateTimeFormat(localeFor(language), { day: "numeric", timeZone });
      const monthOnly = new Intl.DateTimeFormat(localeFor(language), { month: "long", timeZone });
      const startMonth = monthOnly.format(startsAt);
      const endMonth = monthOnly.format(inclusiveEnd);
      date = startMonth === endMonth
        ? `${dayOnly.format(startsAt)}–${dayMonth.format(inclusiveEnd)}`
        : `${dayMonth.format(startsAt)} – ${dayMonth.format(inclusiveEnd)}`;
    } else {
      date = new Intl.DateTimeFormat(localeFor(language), {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone,
      }).format(startsAt);
    }
  }

  return {
    eventId: event.id,
    canonicalSlug: event.canonical_slug,
    title: translation.title,
    description: translation.description || "",
    date,
    venue,
    detailsUrl: `${telegramMiniAppOrigin}?startapp=${encodeURIComponent(cityPosterStartParam(event.canonical_slug))}`,
    appUrl: `${publicAppOrigin()}/offers?event=${encodeURIComponent(event.canonical_slug)}`,
    heroMediaUrl: event.hero_media_url || undefined,
    language,
  };
}

export function buildTelegramCityPostersCard(card: TrustedCityPostersShareCard, imageUrl: string) {
  const copy = labels[card.language] || labels.en;
  const caption = [card.title, card.description, card.date, card.venue].filter(Boolean).join("\n").slice(0, 1024);
  return {
    type: "photo" as const,
    id: card.eventId.slice(0, 64),
    photo_url: imageUrl,
    thumbnail_url: imageUrl,
    photo_width: 1200,
    photo_height: 900,
    title: card.title.slice(0, 256),
    description: [card.date, card.venue].filter(Boolean).join(" · ").slice(0, 512),
    caption,
    reply_markup: {
      inline_keyboard: [[
        { text: copy.details, url: card.detailsUrl },
        { text: copy.plan, callback_data: `cpplan:${card.eventId}` },
      ]],
    },
  };
}
