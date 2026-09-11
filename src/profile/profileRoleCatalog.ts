import type { Language } from "../types";

export type ProfileRoleLocale = Language | "pl" | "sk";

export const profileRoleLocales = ["ru", "uk", "cs", "en", "pl", "sk"] as const satisfies readonly ProfileRoleLocale[];

export const profileRoleIds = [
  "driver",
  "guide",
  "coach",
  "instructor",
  "photographer",
  "host",
  "dj",
  "mechanic",
  "translator",
  "mushroom-expert",
] as const;

export type ProfileRoleId = typeof profileRoleIds[number];

export type ProfileRoleDefinition = {
  id: ProfileRoleId;
  labels: Record<ProfileRoleLocale, string>;
};

export const profileRoleCatalog: readonly ProfileRoleDefinition[] = [
  {
    id: "driver",
    labels: { ru: "Водитель", uk: "Водій", cs: "Řidič", en: "Driver", pl: "Kierowca", sk: "Vodič" },
  },
  {
    id: "guide",
    labels: { ru: "Гид", uk: "Гід", cs: "Průvodce", en: "Guide", pl: "Przewodnik", sk: "Sprievodca" },
  },
  {
    id: "coach",
    labels: { ru: "Тренер", uk: "Тренер", cs: "Trenér", en: "Coach", pl: "Trener", sk: "Tréner" },
  },
  {
    id: "instructor",
    labels: { ru: "Инструктор", uk: "Інструктор", cs: "Instruktor", en: "Instructor", pl: "Instruktor", sk: "Inštruktor" },
  },
  {
    id: "photographer",
    labels: { ru: "Фотограф", uk: "Фотограф", cs: "Fotograf", en: "Photographer", pl: "Fotograf", sk: "Fotograf" },
  },
  {
    id: "host",
    labels: { ru: "Ведущий мероприятия", uk: "Ведучий події", cs: "Moderátor akce", en: "Event host", pl: "Prowadzący wydarzenie", sk: "Moderátor podujatia" },
  },
  {
    id: "dj",
    labels: { ru: "DJ", uk: "DJ", cs: "DJ", en: "DJ", pl: "DJ", sk: "DJ" },
  },
  {
    id: "mechanic",
    labels: { ru: "Механик", uk: "Механік", cs: "Mechanik", en: "Mechanic", pl: "Mechanik", sk: "Mechanik" },
  },
  {
    id: "translator",
    labels: { ru: "Переводчик", uk: "Перекладач", cs: "Tlumočník", en: "Translator", pl: "Tłumacz", sk: "Tlmočník" },
  },
  {
    id: "mushroom-expert",
    labels: { ru: "Эксперт по грибам", uk: "Експерт із грибів", cs: "Odborník na houby", en: "Mushroom expert", pl: "Ekspert od grzybów", sk: "Odborník na huby" },
  },
];

const roleById = new Map(profileRoleCatalog.map((role) => [role.id, role] as const));

export const getProfileRoleDefinition = (id: ProfileRoleId) => roleById.get(id);

export const getProfileRoleLabel = (id: ProfileRoleId, locale: ProfileRoleLocale) =>
  getProfileRoleDefinition(id)?.labels[locale] || getProfileRoleDefinition(id)?.labels.en || id;
