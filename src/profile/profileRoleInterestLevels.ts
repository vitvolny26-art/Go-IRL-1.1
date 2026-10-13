import type { ProfileRoleLocale } from "./profileRoleCatalog";

export const profileRoleInterestLevelIds = [
  "want_to_try",
  "can_help",
  "professional",
] as const;

export type ProfileRoleInterestLevelId = typeof profileRoleInterestLevelIds[number];

type ProfileRoleInterestLevelDefinition = Readonly<{
  id: ProfileRoleInterestLevelId;
  labels: Record<ProfileRoleLocale, string>;
}>;

export const profileRoleInterestLevels: readonly ProfileRoleInterestLevelDefinition[] = [
  {
    id: "want_to_try",
    labels: {
      ru: "Хочу попробовать",
      uk: "Хочу спробувати",
      cs: "Chci vyzkoušet",
      en: "Want to try",
      pl: "Chcę spróbować",
      sk: "Chcem vyskúšať",
    },
  },
  {
    id: "can_help",
    labels: {
      ru: "Могу помочь",
      uk: "Можу допомогти",
      cs: "Mohu pomoci",
      en: "Can help",
      pl: "Mogę pomóc",
      sk: "Môžem pomôcť",
    },
  },
  {
    id: "professional",
    labels: {
      ru: "Профессионал",
      uk: "Професіонал",
      cs: "Profesionál",
      en: "Professional",
      pl: "Profesjonalista",
      sk: "Profesionál",
    },
  },
];

const levelById = new Map(profileRoleInterestLevels.map((level) => [level.id, level] as const));

export const isProfileRoleInterestLevelId = (value: string): value is ProfileRoleInterestLevelId =>
  profileRoleInterestLevelIds.includes(value as ProfileRoleInterestLevelId);

export const getProfileRoleInterestLevelLabel = (
  id: ProfileRoleInterestLevelId,
  locale: ProfileRoleLocale,
) => levelById.get(id)?.labels[locale] || levelById.get(id)?.labels.en || id;
