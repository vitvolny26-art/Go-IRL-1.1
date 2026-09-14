import type { Language } from "../types";
import { activitySentence } from "./templates/activity";
import type { ShareLanguageMap, ShareModel } from "./types";

const greetingByLanguage: ShareLanguageMap<string> = {
  ru: "👋 Привет!",
  uk: "👋 Привіт!",
  cs: "👋 Ahoj!",
  en: "👋 Hey!",
  pl: "👋 Hey!",
  sk: "👋 Ahoj!",
};

export const closingLines: ShareLanguageMap<string[]> = {
  ru: [
    "Присоединяйся! Будем рады познакомиться 😊",
    "Если хочешь, присоединяйся. Будем рады видеть тебя 😊",
    "Приходи, если получится. Будет приятно познакомиться 😊",
  ],
  uk: [
    "Приєднуйся! Будемо раді познайомитися 😊",
    "Якщо хочеш, приєднуйся. Будемо раді тебе бачити 😊",
    "Приходь, якщо вийде. Буде приємно познайомитися 😊",
  ],
  cs: [
    "Přidej se! Rádi tě poznáme 😊",
    "Jestli chceš, připoj se. Rádi tě uvidíme 😊",
    "Doraz, pokud ti to vyjde. Rádi tě poznáme 😊",
  ],
  en: [
    "Join us! We'd be happy to meet you 😊",
    "If you'd like, join us. We'd be happy to see you 😊",
    "Come by if you can. It would be nice to meet you 😊",
  ],
  pl: [
    "Join us! We'd be happy to meet you 😊",
    "If you'd like, join us. We'd be happy to see you 😊",
    "Come by if you can. It would be nice to meet you 😊",
  ],
  sk: [
    "Přidej se! Rádi tě poznáme 😊",
    "Jestli chceš, připoj se. Rádi tě uvidíme 😊",
    "Doraz, pokud ti to vyjde. Rádi tě poznáme 😊",
  ],
};

export const renderShareText = (model: ShareModel, language: Language, closingLine: string) =>
  [
    greetingByLanguage[language],
    "",
    activitySentence[language][model.kind](model),
    "",
    model.location && `📍 ${model.location}`,
    `🕕 ${model.timeRange}`,
    model.priceLine,
    model.lowSpotsLine,
    "",
    closingLine,
    "",
    model.includeUrl && model.url ? `${model.joinText}:` : model.joinText,
    model.includeUrl && model.url,
    "",
    "GO IRL",
  ].filter(Boolean).join("\n");

