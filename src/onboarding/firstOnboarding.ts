import { supabase } from "../supabase";

export const firstOnboardingTermsVersion = "2026-07-29";
export const firstOnboardingPrivacyVersion = "2026-07-14";
export const firstOnboardingRequiredEvent = "go-irl:first-onboarding-required";
export const firstOnboardingCompletedEvent = "go-irl:first-onboarding-completed";

export type FirstOnboardingState = {
  completed: boolean;
  nickname?: string;
  is18OrOlder?: boolean;
  termsVersion?: string;
  termsAcceptedAt?: string;
  privacyVersion?: string;
  privacyAcceptedAt?: string;
  completedAt?: string;
};

export type CompleteFirstOnboardingInput = {
  nickname: string;
  is18OrOlder: boolean;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
};

export class FirstOnboardingRequiredError extends Error {
  constructor() {
    super("First onboarding is required");
    this.name = "FirstOnboardingRequiredError";
  }
}

let cachedState: FirstOnboardingState | null = null;
let inFlightState: Promise<FirstOnboardingState> | null = null;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

export const normalizeFirstOnboardingNickname = (value: string) => value.trim().toLowerCase();

export const validateFirstOnboardingNickname = (value: string) => {
  const nickname = normalizeFirstOnboardingNickname(value);
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(nickname)) return "invalid_nickname";
  if (nickname.length < 3 || nickname.length > 24) return "invalid_nickname";
  if (/^(goirl|admin|support|moderator|official)(_|$)/.test(nickname)) return "reserved_nickname";
  return null;
};

export const parseFirstOnboardingState = (value: unknown): FirstOnboardingState => {
  const row = asRecord(Array.isArray(value) ? value[0] : value);
  if (row.completed !== true) return { completed: false };
  return {
    completed: true,
    nickname: typeof row.nickname === "string" ? row.nickname : undefined,
    is18OrOlder: row.is_18_or_older === true,
    termsVersion: typeof row.terms_version === "string" ? row.terms_version : undefined,
    termsAcceptedAt: typeof row.terms_accepted_at === "string" ? row.terms_accepted_at : undefined,
    privacyVersion: typeof row.privacy_version === "string" ? row.privacy_version : undefined,
    privacyAcceptedAt: typeof row.privacy_accepted_at === "string" ? row.privacy_accepted_at : undefined,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : undefined,
  };
};

export const isFirstOnboardingComplete = (state: FirstOnboardingState | null | undefined) => state?.completed === true;

export function clearFirstOnboardingCache() {
  cachedState = null;
  inFlightState = null;
}

export async function loadFirstOnboardingState(options: { force?: boolean } = {}) {
  if (!options.force && cachedState) return cachedState;
  if (!options.force && inFlightState) return inFlightState;

  const request = (async () => {
    const { data, error } = await supabase.rpc("get_my_first_onboarding");
    if (error) throw error;
    const state = parseFirstOnboardingState(data);
    cachedState = state;
    return state;
  })();

  if (!options.force) inFlightState = request;
  try {
    return await request;
  } finally {
    if (inFlightState === request) inFlightState = null;
  }
}

export async function completeFirstOnboarding(input: CompleteFirstOnboardingInput) {
  const nickname = normalizeFirstOnboardingNickname(input.nickname);
  const nicknameError = validateFirstOnboardingNickname(nickname);
  if (nicknameError) throw new Error(nicknameError);
  if (!input.is18OrOlder) throw new Error("adult_confirmation_required");
  if (!input.acceptedTerms) throw new Error("terms_acceptance_required");
  if (!input.acceptedPrivacy) throw new Error("privacy_acceptance_required");

  const { data, error } = await supabase.rpc("complete_my_first_onboarding", {
    p_nickname: nickname,
    p_is_18_or_older: true,
    p_terms_version: firstOnboardingTermsVersion,
    p_privacy_version: firstOnboardingPrivacyVersion,
  });
  if (error) throw error;

  const state = parseFirstOnboardingState(data);
  if (!state.completed) throw new Error("first_onboarding_incomplete_response");
  cachedState = state;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(firstOnboardingCompletedEvent));
  }
  return state;
}

export function requestFirstOnboardingUi() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(firstOnboardingRequiredEvent));
  }
}

export async function ensureFirstOnboardingComplete() {
  const state = await loadFirstOnboardingState();
  if (state.completed) return state;
  requestFirstOnboardingUi();
  throw new FirstOnboardingRequiredError();
}
