import type { Language } from "../types";
import { getCurrentAuthIdentity, getCurrentUserRole, isBrowserMockMode } from "../authSession";
import { supabase } from "../supabase";
import {
  emptyBeautyLocalizedText,
  normalizeBeautyServiceSpecialization,
  resolveBeautyLocalizedText,
  withBeautyServices,
  type BeautyLocalizedText,
  type BeautyPortfolioItem,
  type BeautyService,
  type BeautyWeekday,
  type BeautyWorkspace,
} from "./beautySetupModel";
import { buildBeautyPublicLink, isValidBeautyPublicSlug, normalizeBeautyPublicSlug } from "./beautyPublicSlug";
import {
  loadLocalBeautyWorkspace,
  resetLocalBeautyWorkspace,
  saveLocalBeautyWorkspace,
} from "./beautyWorkspaceLocalStorage";

type BeautyProfileRow = {
  profile_id: string;
  slug: string;
  city_id: string;
  display_name: string;
  public_location: string;
  contact: string;
  exact_address: string;
  publication_state: "draft" | "published" | "hidden";
  service_name?: string;
  duration_minutes?: number;
  price_czk?: number;
  currency?: "CZK";
  updated_at: string;
  description_i18n?: Partial<BeautyLocalizedText> | null;
  service_name_i18n?: Partial<BeautyLocalizedText> | null;
  instagram_url?: string | null;
  experience_i18n?: Partial<BeautyLocalizedText> | null;
  specialization_i18n?: Partial<BeautyLocalizedText> | null;
  hygiene_i18n?: Partial<BeautyLocalizedText> | null;
  materials_i18n?: Partial<BeautyLocalizedText> | null;
  spoken_languages_i18n?: Partial<BeautyLocalizedText> | null;
  certificates_i18n?: Partial<BeautyLocalizedText> | null;
  booking_notes_i18n?: Partial<BeautyLocalizedText> | null;
  portfolio?: unknown;
  services?: unknown;
};

type BeautyProfileSaveRow = {
  status: "saved" | "conflict";
  profile_id: string;
  slug: string;
  publication_state: "draft" | "published" | "hidden";
  updated_at: string;
};

type BeautySlugUpdateRow = {
  status: "saved" | "slug_taken" | "profile_missing" | "invalid_slug";
  public_slug: string;
  updated_at: string | null;
};

type RpcError = { code?: string; message?: string } | null;

type ServerService = {
  id?: unknown;
  specialization?: unknown;
  name?: unknown;
  name_i18n?: unknown;
  duration_minutes?: unknown;
  price_czk?: unknown;
  buffer_minutes?: unknown;
  active?: unknown;
  sort_order?: unknown;
};

type ServerPortfolioItem = {
  id?: unknown;
  image_url?: unknown;
  alt_i18n?: unknown;
  sort_order?: unknown;
};

type BeautyAvailabilityRuleInput = {
  weekday: number;
  start_time: string;
  end_time: string;
  slot_interval_minutes: number;
};

let expectedServerUpdatedAt: string | null = null;

const weekdayNumber: Record<BeautyWeekday, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

const usesTrustedBeautyStorage = () => {
  const identity = getCurrentAuthIdentity();
  return !isBrowserMockMode()
    && identity?.source === "trusted-telegram"
    && getCurrentUserRole() === "professional";
};

const isMissingRpc = (error: RpcError) => error?.code === "PGRST202"
  || Boolean(error?.message?.includes("Could not find the function"));

const buildBeautyAvailabilityRules = (workspace: BeautyWorkspace): BeautyAvailabilityRuleInput[] | null => {
  const { weekdays, startTime, endTime, breakEnabled, breakStart, breakEnd } = workspace.availability;
  if (!startTime || !endTime || startTime >= endTime) return null;

  const segments: Array<[string, string]> = breakEnabled
    ? (breakStart > startTime && breakStart < breakEnd && breakEnd < endTime
      ? [[startTime, breakStart], [breakEnd, endTime]]
      : [])
    : [[startTime, endTime]];
  if (breakEnabled && !segments.length) return null;

  return weekdays.flatMap((day) => segments.map(([start_time, end_time]) => ({
    weekday: weekdayNumber[day],
    start_time,
    end_time,
    slot_interval_minutes: 30,
  })));
};

const normalizeTranslations = (
  value: Partial<BeautyLocalizedText> | null | undefined,
  fallback: BeautyLocalizedText = emptyBeautyLocalizedText(),
): BeautyLocalizedText => ({
  ru: typeof value?.ru === "string" ? value.ru : fallback.ru,
  uk: typeof value?.uk === "string" ? value.uk : fallback.uk,
  cs: typeof value?.cs === "string" ? value.cs : fallback.cs,
  en: typeof value?.en === "string" ? value.en : fallback.en,
});

const parseServices = (value: unknown, base: BeautyWorkspace, language: Language): BeautyService[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const service = item as ServerService;
    const serviceId = typeof service.id === "string" && service.id.trim() ? service.id.trim() : `server-service-${index + 1}`;
    const localFallback = base.services.find((candidate) => candidate.id === serviceId) || (index === 0 ? base.service : undefined);
    const nameByLanguage = normalizeTranslations(
      service.name_i18n as Partial<BeautyLocalizedText> | undefined,
      index === 0 ? base.service.nameByLanguage : emptyBeautyLocalizedText(),
    );
    const fallbackName = typeof service.name === "string" ? service.name : "";
    return {
      id: serviceId,
      specialization: normalizeBeautyServiceSpecialization(service.specialization ?? localFallback?.specialization),
      name: resolveBeautyLocalizedText(nameByLanguage, language, fallbackName),
      nameByLanguage,
      durationMinutes: Number(service.duration_minutes) || base.service.durationMinutes,
      priceCzk: Number.isFinite(Number(service.price_czk)) ? Number(service.price_czk) : base.service.priceCzk,
      bufferMinutes: Number.isFinite(Number(service.buffer_minutes)) ? Number(service.buffer_minutes) : 0,
      active: service.active !== false,
      sortOrder: Number.isFinite(Number(service.sort_order)) ? Number(service.sort_order) : index,
    };
  });
};

const parsePortfolio = (value: unknown): BeautyPortfolioItem[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const portfolioItem = item as ServerPortfolioItem;
    return {
      id: typeof portfolioItem.id === "string" && portfolioItem.id.trim() ? portfolioItem.id.trim() : `server-work-${index + 1}`,
      imageUrl: typeof portfolioItem.image_url === "string" ? portfolioItem.image_url.trim() : "",
      altByLanguage: normalizeTranslations(portfolioItem.alt_i18n as Partial<BeautyLocalizedText> | undefined),
      sortOrder: Number.isFinite(Number(portfolioItem.sort_order)) ? Number(portfolioItem.sort_order) : index,
    };
  }).filter((item) => item.imageUrl);
};

const mapServerProfile = (base: BeautyWorkspace, row: BeautyProfileRow, language: Language): BeautyWorkspace => {
  const descriptionByLanguage = normalizeTranslations(row.description_i18n, base.profile.descriptionByLanguage);
  const legacyServiceNameByLanguage = normalizeTranslations(row.service_name_i18n, {
    ...base.service.nameByLanguage,
    [language]: row.service_name || base.service.name,
  });
  const serverServices = parseServices(row.services, base, language);
  const services = serverServices.length ? serverServices : [{
    ...base.service,
    name: resolveBeautyLocalizedText(legacyServiceNameByLanguage, language, row.service_name || base.service.name),
    nameByLanguage: legacyServiceNameByLanguage,
    durationMinutes: row.duration_minutes || base.service.durationMinutes,
    priceCzk: Number.isFinite(row.price_czk) ? Number(row.price_czk) : base.service.priceCzk,
  }];
  const workspace: BeautyWorkspace = {
    ...base,
    published: row.publication_state === "published",
    currentStep: row.publication_state === "published" ? "pro_setup_published" : base.currentStep,
    updatedAt: row.updated_at,
    publicLink: `/beauty/${row.slug}`,
    profile: {
      ...base.profile,
      displayName: row.display_name,
      city: "Olomouc",
      publicLocation: row.public_location,
      contact: row.contact,
      exactAddress: row.exact_address,
      description: resolveBeautyLocalizedText(descriptionByLanguage, language, ""),
      descriptionByLanguage,
      instagramUrl: row.instagram_url?.trim() || "",
      experienceByLanguage: normalizeTranslations(row.experience_i18n),
      specializationByLanguage: normalizeTranslations(row.specialization_i18n),
      hygieneByLanguage: normalizeTranslations(row.hygiene_i18n),
      materialsByLanguage: normalizeTranslations(row.materials_i18n),
      spokenLanguagesByLanguage: normalizeTranslations(row.spoken_languages_i18n),
      certificatesByLanguage: normalizeTranslations(row.certificates_i18n),
      bookingNotesByLanguage: normalizeTranslations(row.booking_notes_i18n),
    },
    service: services[0],
    services,
    portfolio: parsePortfolio(row.portfolio),
  };
  return withBeautyServices(workspace, services);
};

const getMyBeautyProfile = async () => {
  const expanded = await supabase.rpc("get_my_beauty_profile_v3");
  if (!expanded.error) return expanded;
  if (!isMissingRpc(expanded.error)) return expanded;
  const localized = await supabase.rpc("get_my_beauty_profile_v2");
  if (!localized.error) return localized;
  if (!isMissingRpc(localized.error)) return localized;
  return supabase.rpc("get_my_beauty_profile");
};

export const loadBeautyWorkspace = async (language: Language = "en"): Promise<BeautyWorkspace> => {
  const local = await loadLocalBeautyWorkspace(language);
  if (!usesTrustedBeautyStorage()) return local;

  const result = await getMyBeautyProfile();
  if (result.error) throw result.error;
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as BeautyProfileRow | undefined;
  if (!row) {
    expectedServerUpdatedAt = null;
    return { ...local, published: false };
  }

  expectedServerUpdatedAt = row.updated_at;
  const workspace = mapServerProfile(local, row, language);
  await saveLocalBeautyWorkspace(workspace);
  return workspace;
};

const saveLegacyBeautyWorkspace = (workspace: BeautyWorkspace) => supabase.rpc("save_my_beauty_profile", {
  p_display_name: workspace.profile.displayName,
  p_public_location: workspace.profile.publicLocation,
  p_contact: workspace.profile.contact,
  p_exact_address: workspace.profile.exactAddress,
  p_service_name: workspace.service.name,
  p_duration_minutes: workspace.service.durationMinutes,
  p_price_czk: workspace.service.priceCzk,
  p_publication_state: workspace.published ? "published" : "draft",
  p_expected_updated_at: expectedServerUpdatedAt,
});

const saveLocalizedBeautyWorkspace = (workspace: BeautyWorkspace) => supabase.rpc("save_my_beauty_profile_v2", {
  p_display_name: workspace.profile.displayName,
  p_public_location: workspace.profile.publicLocation,
  p_contact: workspace.profile.contact,
  p_exact_address: workspace.profile.exactAddress,
  p_description_i18n: workspace.profile.descriptionByLanguage,
  p_service_name_i18n: workspace.service.nameByLanguage,
  p_duration_minutes: workspace.service.durationMinutes,
  p_price_czk: workspace.service.priceCzk,
  p_publication_state: workspace.published ? "published" : "draft",
  p_expected_updated_at: expectedServerUpdatedAt,
});

export const saveBeautyWorkspace = async (workspace: BeautyWorkspace) => {
  await saveLocalBeautyWorkspace(workspace);
  if (!usesTrustedBeautyStorage()) return;

  const expandedResult = await supabase.rpc("save_my_beauty_profile_v3", {
    p_display_name: workspace.profile.displayName,
    p_public_location: workspace.profile.publicLocation,
    p_contact: workspace.profile.contact,
    p_exact_address: workspace.profile.exactAddress,
    p_description_i18n: workspace.profile.descriptionByLanguage,
    p_instagram_url: workspace.profile.instagramUrl,
    p_experience_i18n: workspace.profile.experienceByLanguage,
    p_specialization_i18n: workspace.profile.specializationByLanguage,
    p_hygiene_i18n: workspace.profile.hygieneByLanguage,
    p_materials_i18n: workspace.profile.materialsByLanguage,
    p_spoken_languages_i18n: workspace.profile.spokenLanguagesByLanguage,
    p_certificates_i18n: workspace.profile.certificatesByLanguage,
    p_booking_notes_i18n: workspace.profile.bookingNotesByLanguage,
    p_portfolio: workspace.portfolio.map((item, index) => ({
      id: item.id,
      image_url: item.imageUrl,
      alt_i18n: item.altByLanguage,
      sort_order: index,
    })),
    p_services: workspace.services.map((item, index) => ({
      id: item.id,
      specialization: item.specialization,
      name_i18n: item.nameByLanguage,
      duration_minutes: item.durationMinutes,
      price_czk: item.priceCzk,
      buffer_minutes: item.bufferMinutes,
      active: item.active,
      sort_order: index,
    })),
    p_publication_state: workspace.published ? "published" : "draft",
    p_expected_updated_at: expectedServerUpdatedAt,
  });

  let result = expandedResult;
  if (expandedResult.error && isMissingRpc(expandedResult.error)) {
    const localizedResult = await saveLocalizedBeautyWorkspace(workspace);
    result = localizedResult.error && isMissingRpc(localizedResult.error)
      ? await saveLegacyBeautyWorkspace(workspace)
      : localizedResult;
  }
  if (result.error) throw result.error;

  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as BeautyProfileSaveRow | undefined;
  if (!row) throw new Error("beauty_profile_save_empty_response");
  if (row.status === "conflict") throw new Error("beauty_profile_conflict");
  expectedServerUpdatedAt = row.updated_at;

  const availabilityRules = buildBeautyAvailabilityRules(workspace);
  if (availabilityRules) {
    const availabilityResult = await supabase.rpc("go_irl_replace_my_beauty_availability", {
      p_profile_id: row.profile_id,
      p_rules: availabilityRules,
    });
    if (availabilityResult.error && !isMissingRpc(availabilityResult.error)) throw availabilityResult.error;
  }
};

export const updateBeautyPublicSlug = async (workspace: BeautyWorkspace, requestedSlug: string) => {
  const slug = normalizeBeautyPublicSlug(requestedSlug);
  if (!isValidBeautyPublicSlug(slug)) throw new Error("beauty_slug_invalid");

  if (!usesTrustedBeautyStorage()) {
    const localWorkspace = { ...workspace, publicLink: buildBeautyPublicLink(slug) };
    await saveLocalBeautyWorkspace(localWorkspace);
    return localWorkspace;
  }

  const result = await supabase.rpc("update_my_beauty_slug", { p_slug: slug });
  if (result.error) throw result.error;
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as BeautySlugUpdateRow | undefined;
  if (!row) throw new Error("beauty_slug_update_empty_response");
  if (row.status === "slug_taken") throw new Error("beauty_slug_taken");
  if (row.status === "invalid_slug") throw new Error("beauty_slug_invalid");
  if (row.status === "profile_missing") throw new Error("beauty_profile_missing");

  expectedServerUpdatedAt = row.updated_at;
  const updatedWorkspace = {
    ...workspace,
    publicLink: buildBeautyPublicLink(row.public_slug),
    updatedAt: row.updated_at || workspace.updatedAt,
  };
  await saveLocalBeautyWorkspace(updatedWorkspace);
  return updatedWorkspace;
};

export const resetBeautyWorkspace = async () => {
  await resetLocalBeautyWorkspace();
};
