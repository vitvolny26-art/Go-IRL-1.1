import type { Language } from "../types";

export const BEAUTY_SCHEMA_VERSION = 6 as const;
export const beautyContentLanguages = ["ru", "uk", "cs", "en"] as const satisfies readonly Language[];
export type BeautyLocalizedText = Record<Language, string>;

export const beautySetupSteps = [
  "pro_setup_profile",
  "pro_setup_service",
  "pro_setup_availability",
  "pro_setup_review",
] as const;

export type BeautySetupStep =
  | (typeof beautySetupSteps)[number]
  | "pro_setup_published"
  | "pro_public_preview"
  | "pro_workspace";

export type BeautyWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type BeautyValidationCode =
  | "profile_display_name_required"
  | "profile_city_required"
  | "profile_public_location_required"
  | "profile_contact_required"
  | "profile_exact_address_required"
  | "service_name_required"
  | "service_duration_invalid"
  | "service_price_invalid"
  | "service_buffer_invalid"
  | "availability_weekday_required"
  | "availability_time_required"
  | "availability_time_order_invalid"
  | "availability_break_required"
  | "availability_break_order_invalid"
  | "availability_break_outside_working_hours";

export const beautyServiceSpecializations = ["nails", "barber"] as const;
export type BeautyServiceSpecialization = (typeof beautyServiceSpecializations)[number];
export const normalizeBeautyServiceSpecialization = (value: unknown): BeautyServiceSpecialization => value === "barber" ? "barber" : "nails";

export type BeautyService = {
  id: string;
  specialization: BeautyServiceSpecialization;
  name: string;
  nameByLanguage: BeautyLocalizedText;
  durationMinutes: number;
  priceCzk: number;
  bufferMinutes: number;
  active: boolean;
  sortOrder: number;
};

export type BeautyPortfolioItem = {
  id: string;
  imageUrl: string;
  altByLanguage: BeautyLocalizedText;
  sortOrder: number;
};

export type BeautyShareCardStatus = "ready" | "updating" | "error" | "deleted";

export type BeautyShareCard = {
  enabled: boolean;
  backgroundImageDataUrl: string;
  logoImageDataUrl: string;
  backgroundPositionY: number;
  serviceIds: string[];
  status: BeautyShareCardStatus;
  generatedImageDataUrl: string;
  generatedAt: string;
  sourceFingerprint: string;
  errorMessage: string;
};

export type BeautyWorkspace = {
  schemaVersion: typeof BEAUTY_SCHEMA_VERSION;
  currentStep: BeautySetupStep;
  published: boolean;
  updatedAt: string;
  publicLink: string;
  profile: {
    displayName: string;
    city: string;
    publicLocation: string;
    contact: string;
    exactAddress: string;
    description: string;
    descriptionByLanguage: BeautyLocalizedText;
    instagramUrl: string;
    experienceByLanguage: BeautyLocalizedText;
    specializationByLanguage: BeautyLocalizedText;
    hygieneByLanguage: BeautyLocalizedText;
    materialsByLanguage: BeautyLocalizedText;
    spokenLanguagesByLanguage: BeautyLocalizedText;
    certificatesByLanguage: BeautyLocalizedText;
    bookingNotesByLanguage: BeautyLocalizedText;
  };
  service: BeautyService;
  services: BeautyService[];
  portfolio: BeautyPortfolioItem[];
  shareCard: BeautyShareCard;
  availability: {
    weekdays: BeautyWeekday[];
    startTime: string;
    endTime: string;
    breakEnabled: boolean;
    breakStart: string;
    breakEnd: string;
  };
};

export const createDefaultBeautyShareCard = (serviceIds: string[] = []): BeautyShareCard => ({
  enabled: true,
  backgroundImageDataUrl: "",
  logoImageDataUrl: "",
  backgroundPositionY: 50,
  serviceIds: serviceIds.slice(0, 3),
  status: "updating",
  generatedImageDataUrl: "",
  generatedAt: "",
  sourceFingerprint: "",
  errorMessage: "",
});

const normalizeBeautyShareCard = (
  value: Partial<BeautyShareCard> | null | undefined,
  services: BeautyService[],
): BeautyShareCard => {
  const activeIds = services.filter((item) => item.active).map((item) => item.id);
  const defaults = createDefaultBeautyShareCard(activeIds);
  const selectedIds = Array.isArray(value?.serviceIds)
    ? value.serviceIds.filter((id): id is string => typeof id === "string" && activeIds.includes(id))
    : defaults.serviceIds;
  const status = value?.status;
  return {
    ...defaults,
    ...value,
    enabled: value?.enabled !== false,
    backgroundImageDataUrl: typeof value?.backgroundImageDataUrl === "string" ? value.backgroundImageDataUrl : "",
    logoImageDataUrl: typeof value?.logoImageDataUrl === "string" ? value.logoImageDataUrl : "",
    backgroundPositionY: Number.isFinite(value?.backgroundPositionY)
      ? Math.min(100, Math.max(0, Number(value?.backgroundPositionY)))
      : defaults.backgroundPositionY,
    serviceIds: Array.from(new Set(selectedIds)).slice(0, 3),
    status: status === "ready" || status === "updating" || status === "error" || status === "deleted"
      ? status
      : defaults.status,
    generatedImageDataUrl: typeof value?.generatedImageDataUrl === "string" ? value.generatedImageDataUrl : "",
    generatedAt: typeof value?.generatedAt === "string" ? value.generatedAt : "",
    sourceFingerprint: typeof value?.sourceFingerprint === "string" ? value.sourceFingerprint : "",
    errorMessage: typeof value?.errorMessage === "string" ? value.errorMessage : "",
  };
};

export type BeautyPublicService = {
  id: string;
  specialization: BeautyServiceSpecialization;
  name: string;
  durationMinutes: number;
  priceCzk: number;
  bufferMinutes: number;
};

export type BeautyPublicProfile = {
  displayName: string;
  city: string;
  publicLocation: string;
  description: string;
  instagramUrl: string;
  experience: string;
  specialization: string;
  hygiene: string;
  materials: string;
  spokenLanguages: string;
  certificates: string;
  bookingNotes: string;
  portfolio: Array<{ id: string; imageUrl: string; alt: string }>;
  services: BeautyPublicService[];
  serviceName: string;
  durationMinutes: number;
  priceCzk: number;
  weekdays: BeautyWeekday[];
  startTime: string;
  endTime: string;
  publicLink: string;
};

const localizedDefaults: Record<Language, {
  profile: Pick<BeautyWorkspace["profile"], "displayName" | "city" | "publicLocation" | "contact" | "exactAddress" | "description">;
  service: Pick<BeautyService, "name" | "durationMinutes" | "priceCzk" | "bufferMinutes">;
}> = {
  ru: {
    profile: {
      displayName: "Студия Анна",
      city: "Оломоуц",
      publicLocation: "Центр, Оломоуц",
      contact: "+420 777 000 111",
      exactAddress: "Horní náměstí 1, Olomouc",
      description: "Маникюр и уход за ногтями с аккуратной записью по времени.",
    },
    service: {
      name: "Маникюр с гель-лаком",
      durationMinutes: 75,
      priceCzk: 890,
      bufferMinutes: 15,
    },
  },
  uk: {
    profile: {
      displayName: "Студія Анна",
      city: "Оломоуц",
      publicLocation: "Центр, Оломоуц",
      contact: "+420 777 000 111",
      exactAddress: "Horní náměstí 1, Olomouc",
      description: "Манікюр і догляд за нігтями з точним записом за часом.",
    },
    service: {
      name: "Манікюр з гель-лаком",
      durationMinutes: 75,
      priceCzk: 890,
      bufferMinutes: 15,
    },
  },
  cs: {
    profile: {
      displayName: "Studio Anna",
      city: "Olomouc",
      publicLocation: "Centrum, Olomouc",
      contact: "+420 777 000 111",
      exactAddress: "Horní náměstí 1, Olomouc",
      description: "Manikúra a péče o nehty s přesnými rezervačními časy.",
    },
    service: {
      name: "Manikúra s gel lakem",
      durationMinutes: 75,
      priceCzk: 890,
      bufferMinutes: 15,
    },
  },
  en: {
    profile: {
      displayName: "Anna Studio",
      city: "Olomouc",
      publicLocation: "City centre, Olomouc",
      contact: "+420 777 000 111",
      exactAddress: "Horní náměstí 1, Olomouc",
      description: "Manicure and nail care with reliable appointment times.",
    },
    service: {
      name: "Gel manicure",
      durationMinutes: 75,
      priceCzk: 890,
      bufferMinutes: 15,
    },
  },
};

export const emptyBeautyLocalizedText = (): BeautyLocalizedText => ({ ru: "", uk: "", cs: "", en: "" });

const allDefaultDescriptions = (): BeautyLocalizedText => ({
  ru: localizedDefaults.ru.profile.description,
  uk: localizedDefaults.uk.profile.description,
  cs: localizedDefaults.cs.profile.description,
  en: localizedDefaults.en.profile.description,
});

const allDefaultServiceNames = (): BeautyLocalizedText => ({
  ru: localizedDefaults.ru.service.name,
  uk: localizedDefaults.uk.service.name,
  cs: localizedDefaults.cs.service.name,
  en: localizedDefaults.en.service.name,
});

export const resolveBeautyLocalizedText = (
  values: Partial<BeautyLocalizedText> | null | undefined,
  language: Language,
  fallback = "",
) => {
  const ordered = [language, "en", "cs", "ru", "uk"] as Language[];
  for (const key of ordered) {
    const value = values?.[key]?.trim();
    if (value) return value;
  }
  return fallback.trim();
};

const normalizedLocalizedText = (
  value: Partial<BeautyLocalizedText> | null | undefined,
  fallback: BeautyLocalizedText = emptyBeautyLocalizedText(),
): BeautyLocalizedText => ({
  ru: typeof value?.ru === "string" ? value.ru : fallback.ru,
  uk: typeof value?.uk === "string" ? value.uk : fallback.uk,
  cs: typeof value?.cs === "string" ? value.cs : fallback.cs,
  en: typeof value?.en === "string" ? value.en : fallback.en,
});

export const createBeautyService = (
  language: Language = "en",
  sortOrder = 0,
  id = `local-service-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): BeautyService => ({
  id,
  specialization: "nails",
  ...localizedDefaults[language].service,
  nameByLanguage: allDefaultServiceNames(),
  active: true,
  sortOrder,
});

export const createBeautyPortfolioItem = (
  sortOrder = 0,
  id = `local-work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): BeautyPortfolioItem => ({
  id,
  imageUrl: "",
  altByLanguage: emptyBeautyLocalizedText(),
  sortOrder,
});

const normalizeService = (
  value: Partial<BeautyService> | null | undefined,
  language: Language,
  index: number,
): BeautyService => {
  const fallback = createBeautyService(language, index, index === 0 ? "local-service-primary" : `local-service-${index + 1}`);
  const nameByLanguage = normalizedLocalizedText(value?.nameByLanguage, index === 0 ? allDefaultServiceNames() : emptyBeautyLocalizedText());
  const legacyName = typeof value?.name === "string" ? value.name : "";
  if (legacyName && !value?.nameByLanguage) nameByLanguage[language] = legacyName;
  return {
    ...fallback,
    ...value,
    id: typeof value?.id === "string" && value.id.trim() ? value.id.trim() : fallback.id,
    specialization: normalizeBeautyServiceSpecialization(value?.specialization),
    name: legacyName || resolveBeautyLocalizedText(nameByLanguage, language, fallback.name),
    nameByLanguage,
    durationMinutes: Number.isFinite(value?.durationMinutes) ? Number(value?.durationMinutes) : fallback.durationMinutes,
    priceCzk: Number.isFinite(value?.priceCzk) ? Number(value?.priceCzk) : fallback.priceCzk,
    bufferMinutes: Number.isFinite(value?.bufferMinutes) ? Number(value?.bufferMinutes) : fallback.bufferMinutes,
    active: value?.active !== false,
    sortOrder: Number.isFinite(value?.sortOrder) ? Number(value?.sortOrder) : index,
  };
};

const normalizePortfolioItem = (value: Partial<BeautyPortfolioItem>, index: number): BeautyPortfolioItem => ({
  id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : `local-work-${index + 1}`,
  imageUrl: typeof value.imageUrl === "string" ? value.imageUrl.trim() : "",
  altByLanguage: normalizedLocalizedText(value.altByLanguage),
  sortOrder: Number.isFinite(value.sortOrder) ? Number(value.sortOrder) : index,
});

export const primaryBeautyService = (workspace: Pick<BeautyWorkspace, "service" | "services">) =>
  [...workspace.services].sort((left, right) => left.sortOrder - right.sortOrder).find((item) => item.active)
  || workspace.services[0]
  || workspace.service;

export const primaryBeautySpecialization = (workspace: Pick<BeautyWorkspace, "service" | "services">) => primaryBeautyService(workspace).specialization;

export const withBeautyServices = (workspace: BeautyWorkspace, services: BeautyService[]): BeautyWorkspace => {
  const normalized = services.map((item, index) => ({ ...item, sortOrder: index }));
  const primary = normalized.find((item) => item.active) || normalized[0] || workspace.service;
  return { ...workspace, services: normalized, service: { ...primary } };
};

export const createDefaultBeautyWorkspace = (language: Language = "en"): BeautyWorkspace => {
  const service = createBeautyService(language, 0, "local-service-primary");
  return {
    schemaVersion: BEAUTY_SCHEMA_VERSION,
    currentStep: "pro_setup_profile",
    published: false,
    updatedAt: new Date().toISOString(),
    publicLink: "https://goirl.local/beauty/anna",
    profile: {
      ...localizedDefaults[language].profile,
      descriptionByLanguage: allDefaultDescriptions(),
      instagramUrl: "",
      experienceByLanguage: emptyBeautyLocalizedText(),
      specializationByLanguage: emptyBeautyLocalizedText(),
      hygieneByLanguage: emptyBeautyLocalizedText(),
      materialsByLanguage: emptyBeautyLocalizedText(),
      spokenLanguagesByLanguage: emptyBeautyLocalizedText(),
      certificatesByLanguage: emptyBeautyLocalizedText(),
      bookingNotesByLanguage: emptyBeautyLocalizedText(),
    },
    service,
    services: [service],
    portfolio: [],
    shareCard: createDefaultBeautyShareCard([service.id]),
    availability: {
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      startTime: "09:00",
      endTime: "17:00",
      breakEnabled: true,
      breakStart: "12:00",
      breakEnd: "12:30",
    },
  };
};

export const upgradeBeautyWorkspace = (value: unknown, language: Language = "en"): BeautyWorkspace | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<BeautyWorkspace> & {
    schemaVersion?: number;
    profile?: Partial<BeautyWorkspace["profile"]>;
    service?: Partial<BeautyService>;
    services?: Array<Partial<BeautyService>>;
    portfolio?: Array<Partial<BeautyPortfolioItem>>;
    shareCard?: Partial<BeautyShareCard>;
  };
  if (!candidate.profile || !candidate.service || !candidate.availability || typeof candidate.currentStep !== "string") return undefined;

  const defaults = createDefaultBeautyWorkspace(language);
  const legacyDescription = typeof candidate.profile.description === "string" ? candidate.profile.description : "";
  const descriptionByLanguage = normalizedLocalizedText(candidate.profile.descriptionByLanguage, allDefaultDescriptions());
  if (legacyDescription && !candidate.profile.descriptionByLanguage) descriptionByLanguage[language] = legacyDescription;

  const sourceServices = Array.isArray(candidate.services) && candidate.services.length
    ? candidate.services
    : [candidate.service];
  const services = sourceServices.map((item, index) => normalizeService(item, language, index));
  const primary = services.find((item) => item.active) || services[0] || defaults.service;

  return {
    ...defaults,
    ...candidate,
    schemaVersion: BEAUTY_SCHEMA_VERSION,
    published: Boolean(candidate.published),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : defaults.updatedAt,
    publicLink: typeof candidate.publicLink === "string" ? candidate.publicLink : defaults.publicLink,
    profile: {
      ...defaults.profile,
      ...candidate.profile,
      description: resolveBeautyLocalizedText(descriptionByLanguage, language, legacyDescription),
      descriptionByLanguage,
      instagramUrl: typeof candidate.profile.instagramUrl === "string" ? candidate.profile.instagramUrl.trim() : "",
      experienceByLanguage: normalizedLocalizedText(candidate.profile.experienceByLanguage),
      specializationByLanguage: normalizedLocalizedText(candidate.profile.specializationByLanguage),
      hygieneByLanguage: normalizedLocalizedText(candidate.profile.hygieneByLanguage),
      materialsByLanguage: normalizedLocalizedText(candidate.profile.materialsByLanguage),
      spokenLanguagesByLanguage: normalizedLocalizedText(candidate.profile.spokenLanguagesByLanguage),
      certificatesByLanguage: normalizedLocalizedText(candidate.profile.certificatesByLanguage),
      bookingNotesByLanguage: normalizedLocalizedText(candidate.profile.bookingNotesByLanguage),
    },
    service: { ...primary },
    services,
    portfolio: Array.isArray(candidate.portfolio)
      ? candidate.portfolio.map(normalizePortfolioItem).filter((item) => item.imageUrl)
      : [],
    shareCard: normalizeBeautyShareCard(candidate.shareCard, services),
    availability: {
      ...defaults.availability,
      ...candidate.availability,
    },
  } as BeautyWorkspace;
};

export const getBeautyStepProgress = (step: BeautySetupStep) => {
  const index = beautySetupSteps.indexOf(step as (typeof beautySetupSteps)[number]);
  return index >= 0 ? { current: index + 1, total: beautySetupSteps.length } : null;
};

export const buildBeautyPublicProfile = (
  workspace: BeautyWorkspace,
  language: Language = "en",
): BeautyPublicProfile => {
  const services = workspace.services
    .filter((item) => item.active)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({
      id: item.id,
      specialization: item.specialization,
      name: resolveBeautyLocalizedText(item.nameByLanguage, language, item.name),
      durationMinutes: item.durationMinutes,
      priceCzk: item.priceCzk,
      bufferMinutes: item.bufferMinutes,
    }));
  const primary = services[0] || {
    id: workspace.service.id,
    specialization: workspace.service.specialization,
    name: resolveBeautyLocalizedText(workspace.service.nameByLanguage, language, workspace.service.name),
    durationMinutes: workspace.service.durationMinutes,
    priceCzk: workspace.service.priceCzk,
    bufferMinutes: workspace.service.bufferMinutes,
  };
  return {
    displayName: workspace.profile.displayName,
    city: workspace.profile.city,
    publicLocation: workspace.profile.publicLocation,
    description: resolveBeautyLocalizedText(workspace.profile.descriptionByLanguage, language, ""),
    instagramUrl: workspace.profile.instagramUrl.trim(),
    experience: resolveBeautyLocalizedText(workspace.profile.experienceByLanguage, language),
    specialization: resolveBeautyLocalizedText(workspace.profile.specializationByLanguage, language),
    hygiene: resolveBeautyLocalizedText(workspace.profile.hygieneByLanguage, language),
    materials: resolveBeautyLocalizedText(workspace.profile.materialsByLanguage, language),
    spokenLanguages: resolveBeautyLocalizedText(workspace.profile.spokenLanguagesByLanguage, language),
    certificates: resolveBeautyLocalizedText(workspace.profile.certificatesByLanguage, language),
    bookingNotes: resolveBeautyLocalizedText(workspace.profile.bookingNotesByLanguage, language),
    portfolio: workspace.portfolio
      .filter((item) => isSafeHttpsUrl(item.imageUrl))
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({
        id: item.id,
        imageUrl: item.imageUrl.trim(),
        alt: resolveBeautyLocalizedText(item.altByLanguage, language),
      })),
    services,
    serviceName: primary.name,
    durationMinutes: primary.durationMinutes,
    priceCzk: primary.priceCzk,
    weekdays: [...workspace.availability.weekdays],
    startTime: workspace.availability.startTime,
    endTime: workspace.availability.endTime,
    publicLink: workspace.publicLink,
  };
};

const isSafeHttpsUrl = (value: string) => value.trim().startsWith("https://");
const isBlank = (value: string) => value.trim().length === 0;
const uniqueCodes = (values: BeautyValidationCode[]) => Array.from(new Set(values));

export const validateBeautyStep = (workspace: BeautyWorkspace, step: BeautySetupStep): BeautyValidationCode[] => {
  if (step === "pro_setup_profile") {
    const errors: BeautyValidationCode[] = [];
    if (isBlank(workspace.profile.displayName)) errors.push("profile_display_name_required");
    if (isBlank(workspace.profile.city)) errors.push("profile_city_required");
    if (isBlank(workspace.profile.publicLocation)) errors.push("profile_public_location_required");
    if (isBlank(workspace.profile.contact)) errors.push("profile_contact_required");
    if (isBlank(workspace.profile.exactAddress)) errors.push("profile_exact_address_required");
    return errors;
  }

  if (step === "pro_setup_service") {
    const errors: BeautyValidationCode[] = [];
    const activeServices = workspace.services.filter((item) => item.active);
    if (!activeServices.length) errors.push("service_name_required");
    activeServices.forEach((service) => {
      if (!beautyContentLanguages.some((item) => !isBlank(service.nameByLanguage[item]))
        && isBlank(service.name)) errors.push("service_name_required");
      if (service.durationMinutes < 5 || service.durationMinutes > 480) errors.push("service_duration_invalid");
      if (service.priceCzk < 0 || service.priceCzk > 100000) errors.push("service_price_invalid");
      if (service.bufferMinutes < 0 || service.bufferMinutes > 240) errors.push("service_buffer_invalid");
    });
    return uniqueCodes(errors);
  }

  if (step === "pro_setup_availability") {
    const errors: BeautyValidationCode[] = [];
    if (!workspace.availability.weekdays.length) errors.push("availability_weekday_required");
    if (!workspace.availability.startTime || !workspace.availability.endTime) errors.push("availability_time_required");
    if (workspace.availability.startTime >= workspace.availability.endTime) errors.push("availability_time_order_invalid");
    if (workspace.availability.breakEnabled) {
      if (!workspace.availability.breakStart || !workspace.availability.breakEnd) errors.push("availability_break_required");
      if (workspace.availability.breakStart >= workspace.availability.breakEnd) errors.push("availability_break_order_invalid");
      if (
        workspace.availability.breakStart
        && workspace.availability.breakEnd
        && (workspace.availability.breakStart < workspace.availability.startTime
          || workspace.availability.breakEnd > workspace.availability.endTime)
      ) errors.push("availability_break_outside_working_hours");
    }
    return errors;
  }

  return [];
};
