import type { Language } from "../types";

const czechPreferenceLabels: Readonly<Record<string, string>> = {
  "Маникюр": "Manikúra",
  "Волосы": "Vlasy",
  "Брови и ресницы": "Obočí a řasy",
  "Массаж": "Masáž",
  "Уход за лицом": "Péče o pleť",
};

export const servicesPreferenceLabel = (value: string, language: Language): string =>
  language === "cs" ? czechPreferenceLabels[value] ?? value : value;
