import { supabase } from "../supabase";

export const beautyMasterOnboardingLanguages = ["ru", "uk", "cs", "en", "pl", "sk"] as const;
export type BeautyMasterOnboardingLanguage = (typeof beautyMasterOnboardingLanguages)[number];

export type BeautyMasterApprovedPayload = {
  version: 1;
  sourceLanguage: BeautyMasterOnboardingLanguage;
  profession: "nails" | "barber";
  cityId: "olomouc";
  displayName: string;
  publicLocation: string;
  contact: string;
  exactAddress: string;
  instagramUrl?: string;
  profile: Record<string, Record<BeautyMasterOnboardingLanguage, string>>;
  services: Array<{
    id: string;
    nameByLanguage: Record<BeautyMasterOnboardingLanguage, string>;
    durationMinutes: number;
    priceCzk: number;
    bufferMinutes: number;
    specialization?: "nails" | "barber";
    active?: boolean;
  }>;
  portfolio: Array<{
    id: string;
    imageUrl: string;
    altByLanguage: Record<BeautyMasterOnboardingLanguage, string>;
  }>;
  availability: {
    weekdays: string[];
    startTime: string;
    endTime: string;
    breakEnabled: boolean;
    breakStart?: string;
    breakEnd?: string;
  };
};

export type PreparedBeautyMasterOnboarding = {
  status: "prepared";
  onboardingId: string;
  expiresAt: string;
  claimUrl: string;
  masterMessage: string;
};

type PrepareRpcRow = {
  status?: string;
  onboarding_id?: string | null;
  expires_at?: string | null;
};

const requestIdPattern = /^GROOMING018-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const languageSet = new Set<string>(beautyMasterOnboardingLanguages);
const claimTtlMs = 3 * 24 * 60 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSixLanguageText = (value: unknown) => {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === beautyMasterOnboardingLanguages.length
    && beautyMasterOnboardingLanguages.every((language) => typeof value[language] === "string");
};

export function parseBeautyMasterApprovedPayload(raw: string): BeautyMasterApprovedPayload {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("beauty_master_approval_invalid_json");
  }
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.sourceLanguage !== "string"
    || !languageSet.has(value.sourceLanguage)
    || (value.profession !== "nails" && value.profession !== "barber")
    || value.cityId !== "olomouc"
    || typeof value.displayName !== "string"
    || typeof value.publicLocation !== "string"
    || typeof value.contact !== "string"
    || typeof value.exactAddress !== "string"
    || !isRecord(value.profile)
    || !Array.isArray(value.services)
    || !Array.isArray(value.portfolio)
    || !isRecord(value.availability)) {
    throw new Error("beauty_master_approval_invalid_contract");
  }

  const requiredProfileKeys = [
    "descriptionByLanguage",
    "experienceByLanguage",
    "specializationByLanguage",
    "hygieneByLanguage",
    "materialsByLanguage",
    "spokenLanguagesByLanguage",
    "certificatesByLanguage",
    "bookingNotesByLanguage",
  ];
  const profile = value.profile as Record<string, unknown>;
  if (!requiredProfileKeys.every((key) => isSixLanguageText(profile[key]))) {
    throw new Error("beauty_master_approval_incomplete_translations");
  }

  if (!value.services.length || !value.services.every((service) =>
    isRecord(service)
    && typeof service.id === "string"
    && isSixLanguageText(service.nameByLanguage)
    && typeof service.durationMinutes === "number"
    && typeof service.priceCzk === "number"
    && typeof service.bufferMinutes === "number")) {
    throw new Error("beauty_master_approval_invalid_services");
  }

  if (!value.portfolio.every((item) =>
    isRecord(item)
    && typeof item.id === "string"
    && typeof item.imageUrl === "string"
    && isSixLanguageText(item.altByLanguage))) {
    throw new Error("beauty_master_approval_invalid_portfolio");
  }

  const availability = value.availability;
  if (!Array.isArray(availability.weekdays)
    || typeof availability.startTime !== "string"
    || typeof availability.endTime !== "string"
    || typeof availability.breakEnabled !== "boolean") {
    throw new Error("beauty_master_approval_invalid_availability");
  }

  return value as BeautyMasterApprovedPayload;
}

export const isBeautyMasterOnboardingRequestId = (value: string) => requestIdPattern.test(value.trim());

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export const createBeautyMasterClaimToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

export const hashBeautyMasterClaimToken = async (token: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const masterMessageCopy: Record<BeautyMasterOnboardingLanguage, (name: string, url: string) => string> = {
  ru: (name, url) => `Здравствуйте, ${name}! Ваш кабинет GO IRL подготовлен. Откройте одноразовую ссылку и войдите через Google. После входа данные заявки загрузятся в черновик кабинета: ${url}`,
  uk: (name, url) => `Вітаємо, ${name}! Ваш кабінет GO IRL підготовлено. Відкрийте одноразове посилання та увійдіть через Google. Після входу дані заявки завантажаться в чернетку кабінету: ${url}`,
  cs: (name, url) => `Dobrý den, ${name}! Váš kabinet GO IRL je připraven. Otevřete jednorázový odkaz a přihlaste se přes Google. Po přihlášení se údaje z žádosti načtou do konceptu kabinetu: ${url}`,
  en: (name, url) => `Hello ${name}! Your GO IRL workspace is ready. Open the one-time link and sign in with Google. After sign-in, your application data will be loaded into your draft workspace: ${url}`,
  pl: (name, url) => `Dzień dobry, ${name}! Twój panel GO IRL jest przygotowany. Otwórz jednorazowy link i zaloguj się przez Google. Po zalogowaniu dane z wniosku zostaną wczytane do wersji roboczej panelu: ${url}`,
  sk: (name, url) => `Dobrý deň, ${name}! Váš kabinet GO IRL je pripravený. Otvorte jednorazový odkaz a prihláste sa cez Google. Po prihlásení sa údaje zo žiadosti načítajú do konceptu kabinetu: ${url}`,
};

export async function prepareBeautyMasterOnboarding(
  requestId: string,
  approvedPayload: BeautyMasterApprovedPayload,
  applicationOrigin = window.location.origin,
): Promise<PreparedBeautyMasterOnboarding> {
  const normalizedRequestId = requestId.trim();
  if (!isBeautyMasterOnboardingRequestId(normalizedRequestId)) {
    throw new Error("beauty_master_approval_invalid_request_id");
  }

  const rawToken = createBeautyMasterClaimToken();
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) throw new Error("beauty_master_claim_token_generation_failed");
  const tokenHash = await hashBeautyMasterClaimToken(rawToken);
  const expiresAt = new Date(Date.now() + claimTtlMs).toISOString();

  const result = await supabase.rpc("go_irl_prepare_beauty_master_onboarding", {
    p_request_id: normalizedRequestId,
    p_token_hash: tokenHash,
    p_approved_payload: approvedPayload,
    p_expires_at: expiresAt,
  });
  if (result.error) throw new Error("beauty_master_approval_prepare_failed");
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as PrepareRpcRow | null;
  if (!row || row.status !== "prepared" || !row.onboarding_id || !row.expires_at) {
    throw new Error(`beauty_master_approval_${row?.status || "prepare_failed"}`);
  }

  const claimUrl = `${new URL(applicationOrigin).origin}/beauty/claim?token=${encodeURIComponent(rawToken)}`;
  return {
    status: "prepared",
    onboardingId: row.onboarding_id,
    expiresAt: row.expires_at,
    claimUrl,
    masterMessage: masterMessageCopy[approvedPayload.sourceLanguage](approvedPayload.displayName.trim(), claimUrl),
  };
}
