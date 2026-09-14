import type { Language } from "./types";

export const MIN_EVENT_DURATION_MINUTES = 15;
export const MAX_EVENT_DURATION_MINUTES = 480;

const canonicalDurationOptions = [
  ...Array.from({ length: 8 }, (_, index) => (index + 1) * 15),
  ...Array.from({ length: 12 }, (_, index) => 150 + index * 30),
];

export const buildDurationOptions = (existingValue?: number) => {
  const options = new Set(canonicalDurationOptions);
  if (
    typeof existingValue === "number"
    && Number.isFinite(existingValue)
    && existingValue >= MIN_EVENT_DURATION_MINUTES
    && existingValue <= MAX_EVENT_DURATION_MINUTES
  ) options.add(existingValue);
  return [...options].sort((left, right) => left - right);
};

const durationUnits: Record<Language, { hour: string; minute: string }> = {
  ru: { hour: "ч", minute: "мин" },
  uk: { hour: "год", minute: "хв" },
  cs: { hour: "h", minute: "min" },
  en: { hour: "h", minute: "min" },
  pl: { hour: "h", minute: "min" },
  sk: { hour: "h", minute: "min" },
};

export const formatDurationOption = (minutes: number, language: Language) => {
  const units = durationUnits[language];
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${minutes} ${units.minute}`;
  if (!remainder) return `${hours} ${units.hour}`;
  return `${hours} ${units.hour} ${remainder} ${units.minute}`;
};
