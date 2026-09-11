import type { Activity, FestivalMetadata, Language } from "./types";

const locales: Record<Language, string> = { ru: "ru-RU", uk: "uk-UA", cs: "cs-CZ", en: "en-GB" };

const parseDate = (value: string) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const festivalMetadata = (activity: Activity): FestivalMetadata | null => {
  const festival = activity.metadata?.festival;
  if (!festival || festival.schema !== "festival.v1" || !parseDate(festival.date_from) || !parseDate(festival.date_to)) return null;
  return festival;
};

export const formatFestivalDateRange = (festival: FestivalMetadata, language: Language) => {
  const from = parseDate(festival.date_from);
  const to = parseDate(festival.date_to);
  if (!from || !to) return "";
  const locale = locales[language];
  if (festival.date_from === festival.date_to) return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(from);
  if (from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth()) {
    const startDay = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(from);
    const end = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(to);
    return `${startDay}–${end}`;
  }
  const short = (date: Date) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  return `${short(from)} – ${short(to)}`;
};

const scheduleLine = (festival: FestivalMetadata, index: number, language: Language) => {
  const slot = festival.schedule?.[index];
  if (!slot) return "";
  const date = parseDate(slot.date);
  const dateLabel = date ? new Intl.DateTimeFormat(locales[language], { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(date) : slot.date;
  const time = slot.start ? `${slot.start}${slot.end ? `–${slot.end}` : ""}` : "";
  const note = slot.note?.[language] || slot.note?.ru || slot.note?.cs || slot.note?.en || slot.note?.uk || "";
  return [dateLabel, time || note].filter(Boolean).join(" · ");
};

export const festivalCardPresentation = (activity: Activity, language: Language) => {
  const festival = festivalMetadata(activity);
  if (!festival) return null;
  const heroUrl = festival.hero?.image_url?.trim() || undefined;
  const sourceUrl = festival.source?.url?.trim() || festival.hero?.source_url?.trim() || undefined;
  const venueLabel = festival.venue?.[language] || festival.venue?.ru || festival.venue?.cs || festival.venue?.en || festival.venue?.uk || activity.address;
  return {
    dateLabel: formatFestivalDateRange(festival, language),
    scheduleLines: (festival.schedule || []).map((_, index) => scheduleLine(festival, index, language)).filter(Boolean),
    venueLabel,
    heroUrl,
    sourceUrl,
    scheduleConflict: Boolean(festival.schedule_conflict),
  };
};
