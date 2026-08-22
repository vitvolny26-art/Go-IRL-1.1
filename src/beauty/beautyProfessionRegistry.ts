import type { Language } from "../types";
import { barberArtwork, manicureArtwork, type ServiceArtwork } from "../services/serviceArtwork";
import {
  createBeautyService,
  primaryBeautySpecialization,
  withBeautyServices,
  type BeautyLocalizedText,
  type BeautyServiceSpecialization,
  type BeautyWorkspace,
} from "./beautySetupModel";

type BeautyProfessionServicePreset = {
  names: BeautyLocalizedText;
  durationMinutes: number;
};

type BeautyProfessionDefinition = {
  id: BeautyServiceSpecialization;
  publicLabel: "Nails" | "Barbering";
  workspaceTitle: Record<Language, string>;
  defaultArtwork: string;
  defaultIcon: string;
  artwork: ServiceArtwork;
  servicePresets: readonly BeautyProfessionServicePreset[];
};

const localized = (ru: string, uk: string, cs: string, en: string): BeautyLocalizedText => ({ ru, uk, cs, en });

const defaultProfileDescriptions = {
  nails: localized(
    "Маникюр и уход за ногтями с аккуратной записью по времени.",
    "Манікюр і догляд за нігтями з точним записом за часом.",
    "Manikúra a péče o nehty s přesnými rezervačními časy.",
    "Manicure and nail care with reliable appointment times.",
  ),
  barber: localized(
    "Барберские стрижки и уход с удобной записью по времени.",
    "Барберські стрижки та догляд зі зручним записом за часом.",
    "Barber střihy a péče s pohodlnou rezervací termínu.",
    "Barber cuts and grooming with convenient appointment times.",
  ),
} satisfies Record<BeautyServiceSpecialization, BeautyLocalizedText>;

const replaceUntouchedProfessionDescription = (
  workspace: BeautyWorkspace,
  profession: BeautyServiceSpecialization,
) => {
  const previousProfession = primaryBeautySpecialization(workspace);
  if (previousProfession === profession) return workspace.profile;

  const previousDefaults = defaultProfileDescriptions[previousProfession];
  const nextDefaults = defaultProfileDescriptions[profession];
  const descriptionByLanguage = { ...workspace.profile.descriptionByLanguage };

  (Object.keys(descriptionByLanguage) as Language[]).forEach((language) => {
    if (descriptionByLanguage[language].trim() === previousDefaults[language].trim()) {
      descriptionByLanguage[language] = nextDefaults[language];
    }
  });

  const legacyDefaultLanguage = (Object.keys(previousDefaults) as Language[])
    .find((language) => workspace.profile.description.trim() === previousDefaults[language].trim());

  return {
    ...workspace.profile,
    description: legacyDefaultLanguage ? nextDefaults[legacyDefaultLanguage] : workspace.profile.description,
    descriptionByLanguage,
  };
};

export const beautyProfessionRegistry = {
  nails: {
    id: "nails",
    publicLabel: "Nails",
    workspaceTitle: {
      ru: "Кабинет мастера",
      uk: "Кабінет майстра",
      cs: "Kabinet profesionála",
      en: "Professional workspace",
    },
    defaultArtwork: manicureArtwork.share,
    defaultIcon: manicureArtwork.icon,
    artwork: manicureArtwork,
    servicePresets: [
      { names: localized("Маникюр", "Манікюр", "Manikúra", "Manicure"), durationMinutes: 60 },
      { names: localized("Маникюр с гель-лаком", "Манікюр з гель-лаком", "Manikúra s gel lakem", "Gel manicure"), durationMinutes: 75 },
      { names: localized("Укрепление натуральных ногтей", "Зміцнення натуральних нігтів", "Zpevnění přírodních nehtů", "Natural nail strengthening"), durationMinutes: 60 },
    ],
  },
  barber: {
    id: "barber",
    publicLabel: "Barbering",
    workspaceTitle: {
      ru: "Кабинет барбера",
      uk: "Кабінет барбера",
      cs: "Barber kabinet",
      en: "Barber workspace",
    },
    defaultArtwork: barberArtwork.share,
    defaultIcon: barberArtwork.icon,
    artwork: barberArtwork,
    servicePresets: [
      { names: localized("Стрижка", "Чоловіча стрижка", "Pánský střih", "Haircut"), durationMinutes: 55 },
      { names: localized("Стрижка бороды", "Стрижка бороди", "Úprava vousů", "Beard trim"), durationMinutes: 30 },
      { names: localized("Стрижка + борода", "Стрижка + борода", "Střih + vousy", "Haircut + beard"), durationMinutes: 75 },
    ],
  },
} satisfies Record<BeautyServiceSpecialization, BeautyProfessionDefinition>;

export const beautyProfessionIds = Object.keys(beautyProfessionRegistry) as BeautyServiceSpecialization[];

export const resolveBeautyProfessionId = (workspace: Pick<BeautyWorkspace, "service" | "services">) =>
  primaryBeautySpecialization(workspace);

export const resolveBeautyProfessionDefinition = (workspace: Pick<BeautyWorkspace, "service" | "services">) =>
  beautyProfessionRegistry[resolveBeautyProfessionId(workspace)];

export const professionServiceSuggestions = (profession: BeautyServiceSpecialization, language: Language) =>
  beautyProfessionRegistry[profession].servicePresets.map((preset) => preset.names[language]);

export const createBeautyProfessionService = (
  language: Language,
  profession: BeautyServiceSpecialization,
  sortOrder: number,
) => {
  const preset = beautyProfessionRegistry[profession].servicePresets[sortOrder % beautyProfessionRegistry[profession].servicePresets.length];
  const service = createBeautyService(language, sortOrder);
  return {
    ...service,
    specialization: profession,
    name: preset.names[language],
    nameByLanguage: { ...preset.names },
    durationMinutes: preset.durationMinutes,
    priceCzk: 0,
    bufferMinutes: 0,
  };
};

export const applyBeautyProfession = (
  workspace: BeautyWorkspace,
  profession: BeautyServiceSpecialization,
): BeautyWorkspace => {
  const source = workspace.services.length ? workspace.services : [workspace.service];
  const services = source.map((service) => ({ ...service, specialization: profession }));
  const profile = replaceUntouchedProfessionDescription(workspace, profession);
  return withBeautyServices({
    ...workspace,
    profile,
    shareCard: {
      ...workspace.shareCard,
      status: "updating",
      generatedImageDataUrl: "",
      generatedAt: "",
      sourceFingerprint: "",
      errorMessage: "",
    },
  }, services);
};
