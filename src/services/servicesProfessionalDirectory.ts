import type { SupabaseClient } from "@supabase/supabase-js";
import { isBrowserMockMode } from "../authSession";
import { supabase } from "../supabase";
import type { Language } from "../types";
import { resolveBeautyLocalizedText, type BeautyLocalizedText } from "../beauty/beautySetupModel";

export type ServicesProfessionalPortfolioItem = {
  id: string;
  imageUrl: string;
  alt: string;
};

export type ServicesProfessional = {
  profileId: string;
  serviceId: string;
  slug: string;
  displayName: string;
  cityId: string;
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
  portfolio: ServicesProfessionalPortfolioItem[];
  serviceName: string;
  durationMinutes: number;
  priceCzk: number;
  bufferMinutes: number;
  currency: "CZK";
  publicLink: string;
  updatedAt: string;
};

type ServicesProfessionalRow = {
  profile_id: string;
  service_id?: string | null;
  slug: string;
  display_name: string;
  city_id: string;
  public_location: string;
  description?: string | null;
  instagram_url?: string | null;
  experience?: string | null;
  specialization?: string | null;
  hygiene?: string | null;
  materials?: string | null;
  spoken_languages?: string | null;
  certificates?: string | null;
  booking_notes?: string | null;
  portfolio?: unknown;
  service_name: string;
  duration_minutes: number;
  price_czk: number;
  buffer_minutes?: number | null;
  currency: "CZK";
  public_link: string;
  updated_at: string;
};

type PortfolioRow = {
  id?: unknown;
  image_url?: unknown;
  alt_i18n?: unknown;
  sort_order?: unknown;
};

type RpcError = { code?: string; message?: string } | null;

export const sharedMockProfessionals: ServicesProfessional[] = [
  {
    profileId: "browser-demo-studio-vita",
    serviceId: "browser-demo-service-gel",
    slug: "studio-vita",
    displayName: "Studio Vita",
    cityId: "olomouc",
    publicLocation: "City centre, Olomouc",
    description: "Manicure and nail care with reliable appointment times.",
    instagramUrl: "",
    experience: "",
    specialization: "",
    hygiene: "",
    materials: "",
    spokenLanguages: "",
    certificates: "",
    bookingNotes: "",
    portfolio: [],
    serviceName: "Gel manicure",
    durationMinutes: 75,
    priceCzk: 890,
    bufferMinutes: 15,
    currency: "CZK",
    publicLink: "/beauty/studio-vita",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
];

const directoryCache = new Map<string, ServicesProfessional[]>();

const parsePortfolio = (value: unknown, language: Language): ServicesProfessionalPortfolioItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = item as PortfolioRow;
      return {
        id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : `portfolio-${index + 1}`,
        imageUrl: typeof row.image_url === "string" ? row.image_url.trim() : "",
        alt: resolveBeautyLocalizedText(row.alt_i18n as Partial<BeautyLocalizedText> | undefined, language),
        sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
      };
    })
    .filter((item) => item.imageUrl)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ id, imageUrl, alt }) => ({ id, imageUrl, alt }));
};

const mapProfessional = (row: ServicesProfessionalRow, language: Language): ServicesProfessional => ({
  profileId: row.profile_id,
  serviceId: row.service_id?.trim() || `${row.profile_id}:${row.service_name}:${row.duration_minutes}:${row.price_czk}`,
  slug: row.slug,
  displayName: row.display_name,
  cityId: row.city_id,
  publicLocation: row.public_location,
  description: row.description?.trim() || "",
  instagramUrl: row.instagram_url?.trim() || "",
  experience: row.experience?.trim() || "",
  specialization: row.specialization?.trim() || "",
  hygiene: row.hygiene?.trim() || "",
  materials: row.materials?.trim() || "",
  spokenLanguages: row.spoken_languages?.trim() || "",
  certificates: row.certificates?.trim() || "",
  bookingNotes: row.booking_notes?.trim() || "",
  portfolio: parsePortfolio(row.portfolio, language),
  serviceName: row.service_name,
  durationMinutes: row.duration_minutes,
  priceCzk: row.price_czk,
  bufferMinutes: Number.isFinite(Number(row.buffer_minutes)) ? Number(row.buffer_minutes) : 0,
  currency: row.currency,
  publicLink: row.public_link,
  updatedAt: row.updated_at,
});

const isMissingRpc = (error: RpcError) => error?.code === "PGRST202"
  || Boolean(error?.message?.includes("Could not find the function"));

export const professionalsForCity = (
  cityId: string,
  professionals?: readonly ServicesProfessional[],
) => {
  const source = professionals
    ?? (isBrowserMockMode() ? sharedMockProfessionals : directoryCache.get(`${cityId}:en`) || []);
  return source.filter((professional) => professional.cityId === cityId);
};

export const loadProfessionalDirectory = async (
  cityId: string,
  language: Language = "en",
  dependencies: {
    client?: SupabaseClient;
    browserMock?: boolean;
  } = {},
): Promise<ServicesProfessional[]> => {
  const browserMock = dependencies.browserMock ?? isBrowserMockMode();
  if (browserMock) return professionalsForCity(cityId, sharedMockProfessionals);

  const client = dependencies.client || supabase;
  const expanded = await client.rpc("go_irl_list_public_beauty_professionals_v3", {
    p_requested_city_id: cityId,
    p_language: language,
  });
  let result = expanded;
  if (expanded.error && isMissingRpc(expanded.error)) {
    const localized = await client.rpc("go_irl_list_public_beauty_professionals_v2", {
      p_requested_city_id: cityId,
      p_language: language,
    });
    result = localized.error && isMissingRpc(localized.error)
      ? await client.rpc("go_irl_list_public_beauty_professionals", {
        p_requested_city_id: cityId,
      })
      : localized;
  }
  if (result.error) throw result.error;

  const professionals = ((result.data || []) as ServicesProfessionalRow[])
    .map((row) => mapProfessional(row, language));
  directoryCache.set(`${cityId}:${language}`, professionals);
  return professionals;
};

export const clearProfessionalDirectoryCache = () => directoryCache.clear();

export const professionalCountLabel = (language: Language, count: number) => {
  if (language === "ru") {
    const mod100 = count % 100;
    const mod10 = count % 10;
    const label = mod100 >= 11 && mod100 <= 14
      ? "мастеров"
      : mod10 === 1
        ? "мастер"
        : mod10 >= 2 && mod10 <= 4
          ? "мастера"
          : "мастеров";
    return `${label} · Волосы, кожа, ногти и другие услуги по уходу за собой`;
  }
  if (language === "uk") {
    const mod100 = count % 100;
    const mod10 = count % 10;
    const label = mod100 >= 11 && mod100 <= 14
      ? "майстрів"
      : mod10 === 1
        ? "майстер"
        : mod10 >= 2 && mod10 <= 4
          ? "майстри"
          : "майстрів";
    return `${label} · Волосся, шкіра, нігті та інші послуги догляду за собою`;
  }
  if (language === "cs") return `${count === 1 ? "profesionál" : "profesionálů"} · Vlasy, pleť, nehty a další služby osobní péče`;
  return `${count === 1 ? "professional" : "professionals"} · Hair, skin, nails and other personal care services`;
};
