import { cities } from "../config/cities";
import { formatEventTime } from "../eventTime";
import { localeByLanguage } from "../i18n";
import type { Activity, Language } from "../types";
import { activityKindTerms } from "./templates/activity";
import type { ActivityShareKind, ShareBuildOptions, ShareLanguageMap, ShareModel } from "./types";

const addMinutes = (time: string, minutes: number) => {
  const normalizedTime = formatEventTime(time);
  if (!normalizedTime) return "";

  const [hours, mins] = normalizedTime.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return "";
  const date = new Date(2026, 0, 1, hours, mins);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toTimeString().slice(0, 5);
};

const activityDuration = (activity: Activity) => activity.metadata?.sport?.durationMinutes || 90;

const weekdayForms: ShareLanguageMap<string[]> = {
  ru: ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"],
  uk: ["неділю", "понеділок", "вівторок", "середу", "четвер", "п'ятницю", "суботу"],
  cs: ["neděli", "pondělí", "úterý", "středu", "čtvrtek", "pátek", "sobotu"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  pl: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  sk: ["neděli", "pondělí", "úterý", "středu", "čtvrtek", "pátek", "sobotu"],
};

const weekdayLabel = (activity: Activity, language: Language) => {
  const date = new Date(`${activity.date}T12:00:00`);
  return weekdayForms[language][date.getDay()] || new Intl.DateTimeFormat(localeByLanguage[language], { weekday: "long" }).format(date);
};

const timeRangeLabel = (activity: Activity) => {
  const start = formatEventTime(activity.time);
  if (!start) return "";

  const end = addMinutes(start, activityDuration(activity));
  return end ? `${start}–${end}` : start;
};

const activityName = (activity: Activity, language: Language) =>
  activity.activity[language].replace(/^[^\p{L}\p{N}]+/u, "").trim() || activity.title[language];

const normalizeText = (value: string) => value.toLocaleLowerCase().trim();

const normalizePlace = (value: string) => value.trim().replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "");

const knownCityNames = (language: Language) =>
  cities.flatMap((city) => Object.values(city.name).concat(city.name[language])).filter(Boolean);

const includesCityName = (value: string, cityName: string) => normalizeText(value).includes(normalizeText(cityName));

const stripCityFromPlace = (place: string, cityName: string) =>
  normalizePlace(
    place
      .replace(new RegExp(`(^|[,\\s])${cityName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([,\\s]|$)`, "gi"), " ")
      .replace(/\s*,\s*,+/g, ","),
  );

export const formatShareLocation = (cityId: string, placeValue: string, language: Language) => {
  const city = cities.find((item) => item.id === cityId)?.name[language] || "";
  const place = normalizePlace(placeValue || "");
  if (!city && !place) return "";
  if (!place) return city;
  if (!city) return place;

  const otherCity = knownCityNames(language).find((name) => normalizeText(name) !== normalizeText(city) && includesCityName(place, name));
  if (otherCity) return place;

  const cleanedPlace = includesCityName(place, city) ? stripCityFromPlace(place, city) : place;
  if (!cleanedPlace) return city;
  if (normalizeText(cleanedPlace) === normalizeText(city)) return city;
  return `${city}, ${cleanedPlace}`;
};

const priceLine = (activity: Activity, language: Language) => {
  if (activity.price <= 0) return "";
  const labels: ShareLanguageMap<string> = {
    ru: `💰 ${activity.price} Kč`,
    uk: `💰 ${activity.price} Kč`,
    cs: `💰 ${activity.price} Kč`,
    en: `💰 ${activity.price} Kč`,
    pl: `💰 ${activity.price} Kč`,
    sk: `💰 ${activity.price} Kč`,
  };
  return labels[language];
};

const lowSpotsLine = (activity: Activity, language: Language) => {
  const free = Math.max(activity.capacity - activity.participants, 0);
  if (free > 3) return "";
  const labels: ShareLanguageMap<string> = {
    ru: `👥 Осталось мест: ${free}`,
    uk: `👥 Залишилось місць: ${free}`,
    cs: `👥 Zbývá míst: ${free}`,
    en: `👥 Spots left: ${free}`,
    pl: `👥 Spots left: ${free}`,
    sk: `👥 Zbývá míst: ${free}`,
  };
  return labels[language];
};

const joinLabel: ShareLanguageMap<string> = {
  ru: "👉 Присоединиться",
  uk: "👉 Приєднатися",
  cs: "👉 Připojit se",
  en: "👉 Join",
  pl: "👉 Join",
  sk: "👉 Připojit se",
};

const detectActivityKind = (activity: Activity, language: Language): ActivityShareKind => {
  const sportType = activity.metadata?.sport?.sportType || "";
  const text = normalizeText(
    [
      activity.activity[language],
      activity.title[language],
      activity.description[language],
      activity.activity.ru,
      activity.activity.uk,
      activity.activity.cs,
      activity.activity.en,
      sportType,
    ].join(" "),
  );

  for (const [kind, terms] of Object.entries(activityKindTerms) as [Exclude<ActivityShareKind, "generic">, string[]][]) {
    if (terms.some((term) => text.includes(normalizeText(term)))) return kind;
  }

  return "generic";
};

export const buildShareModel = (activity: Activity, language: Language, options: ShareBuildOptions = {}): ShareModel => ({
  kind: detectActivityKind(activity, language),
  activity: activityName(activity, language),
  weekday: weekdayLabel(activity, language),
  location: formatShareLocation(activity.cityId, activity.address, language),
  timeRange: timeRangeLabel(activity),
  priceLine: priceLine(activity, language),
  lowSpotsLine: lowSpotsLine(activity, language),
  joinText: joinLabel[language],
  url: options.url,
  includeUrl: options.includePlainTextUrl,
});
