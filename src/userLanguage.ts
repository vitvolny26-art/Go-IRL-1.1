import type { Language } from "./types.js";

export type UserLanguage = Language | "pl" | "sk";

export const userLanguages: readonly UserLanguage[] = ["ru", "uk", "cs", "en", "pl", "sk"];
const supported = new Set<UserLanguage>(userLanguages);

export const parseUserLanguage = (value: unknown): UserLanguage | null => {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase().split(/[-_]/)[0] as UserLanguage;
  return supported.has(code) ? code : null;
};

export const resolveUserLanguage = (value: unknown): UserLanguage => parseUserLanguage(value) || "en";

export const contentLanguageForUserLanguage = (language: UserLanguage): Language => {
  if (language === "pl") return "en";
  if (language === "sk") return "cs";
  return language;
};

export const localeForUserLanguage = (language: UserLanguage) => ({
  ru: "ru-RU",
  uk: "uk-UA",
  cs: "cs-CZ",
  en: "en-GB",
  pl: "pl-PL",
  sk: "sk-SK",
})[language];

export const providerTemplateLanguageCode = (language: UserLanguage) =>
  language === "en" ? "en_US" : language;
