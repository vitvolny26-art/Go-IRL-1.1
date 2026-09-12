import { activityOptions } from "./data.js";
import type { UserLanguage } from "./userLanguage.js";

type ExtendedActivityLanguage = Extract<UserLanguage, "pl" | "sk">;
type ExtendedActivityNames = Record<ExtendedActivityLanguage, string>;

const extendedActivityNames: Record<string, ExtendedActivityNames> = {
  Volleyball: { pl: "Siatkówka", sk: "Volejbal" },
  Football: { pl: "Piłka nożna", sk: "Futbal" },
  Basketball: { pl: "Koszykówka", sk: "Basketbal" },
  Tennis: { pl: "Tenis", sk: "Tenis" },
  Gym: { pl: "Siłownia", sk: "Posilňovňa" },
  Running: { pl: "Bieganie", sk: "Beh" },
  Cycling: { pl: "Rower", sk: "Bicykel" },
  Badminton: { pl: "Badminton", sk: "Bedminton" },
  "Table tennis": { pl: "Tenis stołowy", sk: "Stolný tenis" },
  Yoga: { pl: "Joga", sk: "Joga" },
  Coffee: { pl: "Kawa", sk: "Káva" },
  Cinema: { pl: "Kino", sk: "Kino" },
  Bowling: { pl: "Kręgle", sk: "Bowling" },
  "Board games": { pl: "Gry planszowe", sk: "Stolové hry" },
  Chess: { pl: "Szachy", sk: "Šach" },
  Karaoke: { pl: "Karaoke", sk: "Karaoke" },
  "Inline skating": { pl: "Rolki", sk: "Kolieskové korčule" },
  "Let's get a beer": { pl: "Idziemy na piwo", sk: "Ideme na pivo" },
  "Pub quiz": { pl: "Quiz pubowy", sk: "Pub kvíz" },
  "Wine evening": { pl: "Wieczór z winem", sk: "Vínny večer" },
  Concert: { pl: "Koncert", sk: "Koncert" },
  Festival: { pl: "Festiwal", sk: "Festival" },
  Dancing: { pl: "Taniec", sk: "Tanec" },
  Hike: { pl: "Wędrówka", sk: "Turistika" },
  "Park walk": { pl: "Spacer w parku", sk: "Prechádzka v parku" },
  Swimming: { pl: "Pływanie", sk: "Plávanie" },
  Picnic: { pl: "Piknik", sk: "Piknik" },
  Camping: { pl: "Kemping", sk: "Kempovanie" },
  Fishing: { pl: "Wędkarstwo", sk: "Rybolov" },
  Kayaking: { pl: "Kajaki", sk: "Kajakovanie" },
  Walk: { pl: "Spacer", sk: "Prechádzka" },
  Dinner: { pl: "Kolacja", sk: "Večera" },
  "Language exchange": { pl: "Wymiana językowa", sk: "Jazyková výmena" },
  Coworking: { pl: "Coworking", sk: "Coworking" },
  "Meet new people": { pl: "Nowe znajomości", sk: "Nové známosti" },
  Drawing: { pl: "Rysowanie", sk: "Kreslenie" },
  "Photo walk": { pl: "Fotospacer", sk: "Fotoprechádzka" },
  Ceramics: { pl: "Ceramika", sk: "Keramika" },
  "Music jam": { pl: "Jam muzyczny", sk: "Hudobný jam" },
  Workshop: { pl: "Warsztaty", sk: "Dielňa" },
};

const normalizeActivityName = (value: string) => value.trim().toLocaleLowerCase();

export const localizeCanonicalActivityName = (
  categoryId: string,
  sourceNames: readonly string[],
  language: UserLanguage,
) => {
  const normalized = new Set(sourceNames.map(normalizeActivityName).filter(Boolean));
  const option = (activityOptions[categoryId] || []).find((candidate) => {
    const extended = extendedActivityNames[candidate.name.en];
    return [
      ...Object.values(candidate.name),
      ...(extended ? [extended.pl, extended.sk] : []),
    ].some((name) => normalized.has(normalizeActivityName(String(name))));
  });
  if (!option) return undefined;
  if (language === "pl" || language === "sk") return extendedActivityNames[option.name.en]?.[language];
  return option.name[language];
};
