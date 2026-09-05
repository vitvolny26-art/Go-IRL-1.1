import { setUiLanguage } from "./i18n";
import { contentLanguageForUserLanguage, parseUserLanguage, type UserLanguage } from "./userLanguage";

export type MapProvider = "google" | "apple" | "mapy";
export type CalendarProvider = "google" | "apple" | "outlook";
export type ShareProvider = "telegram" | "messenger" | "whatsapp" | "instagram";
export type ReminderProvider = ShareProvider;
export type LanguagePreferenceSource = "explicit" | "server" | "inferred";

export type UserPreferences = {
  language?: UserLanguage;
  languageSource?: LanguagePreferenceSource;
  cityId?: string;
  mapProvider?: MapProvider | null;
  calendarProvider?: CalendarProvider | null;
  shareProvider?: ShareProvider | null;
  reminderProvider?: ReminderProvider | null;
};

export const userPreferencesStorageKey = "go-irl-user-preferences";
export const legacyLanguageStorageKey = "go-irl-language";
export const userPreferencesChangedEvent = "go-irl-user-preferences-changed";
const uiLanguageStorageKey = "go-irl-ui-language";
const trustedAuthSessionChangedEvent = "go-irl:trusted-auth-session-changed";

const mapProviders = new Set<MapProvider>(["google", "apple", "mapy"]);
const calendarProviders = new Set<CalendarProvider>(["google", "apple", "outlook"]);
const shareProviders = new Set<ShareProvider>(["telegram", "messenger", "whatsapp", "instagram"]);
const reminderProviders = new Set<ReminderProvider>(shareProviders);
const languageSources = new Set<LanguagePreferenceSource>(["explicit", "server", "inferred"]);

const nullableProvider = <T extends string>(value: unknown, allowed: ReadonlySet<T>): T | null | undefined => {
  if (value === null) return null;
  return typeof value === "string" && allowed.has(value as T) ? value as T : undefined;
};

export const normalizeUserPreferences = (value: unknown): UserPreferences => {
  if (!value || typeof value !== "object") return {};
  const parsed = value as Partial<UserPreferences>;
  const language = parseUserLanguage(parsed.language) || undefined;
  const languageSource = parsed.languageSource && languageSources.has(parsed.languageSource) ? parsed.languageSource : undefined;
  return {
    language,
    languageSource,
    cityId: typeof parsed.cityId === "string" && parsed.cityId.trim() ? parsed.cityId : undefined,
    mapProvider: nullableProvider(parsed.mapProvider, mapProviders),
    calendarProvider: nullableProvider(parsed.calendarProvider, calendarProviders),
    shareProvider: nullableProvider(parsed.shareProvider, shareProviders),
    reminderProvider: nullableProvider(parsed.reminderProvider, reminderProviders),
  };
};

export const readUserPreferences = (): UserPreferences => {
  try { return normalizeUserPreferences(JSON.parse(localStorage.getItem(userPreferencesStorageKey) || "null")); }
  catch { return {}; }
};

const explicitUiLanguageForPatch = (patch: Partial<UserPreferences>): UserLanguage | null => {
  if (!patch.language || typeof localStorage === "undefined") return null;
  const selected = parseUserLanguage(localStorage.getItem(uiLanguageStorageKey));
  if (!selected) return null;
  return contentLanguageForUserLanguage(selected) === contentLanguageForUserLanguage(patch.language) ? selected : null;
};

const persistCanonicalLanguage = async (language: UserLanguage) => {
  const [{ getCurrentUserKey, isTrustedAuthReady }, { supabase }] = await Promise.all([
    import("./authSession"),
    import("./supabase"),
  ]);
  if (!isTrustedAuthReady()) return false;
  const userKey = getCurrentUserKey();
  if (!userKey || userKey === "unauthenticated") return false;
  const { error } = await supabase.from("app_users").update({ language_code: language }).eq("user_key", userKey);
  return !error;
};

const applyCanonicalLanguageLocally = async (language: UserLanguage, languageSource: LanguagePreferenceSource) => {
  const next = normalizeUserPreferences({ ...readUserPreferences(), language, languageSource });
  localStorage.setItem(userPreferencesStorageKey, JSON.stringify(next));
  localStorage.setItem(legacyLanguageStorageKey, contentLanguageForUserLanguage(language));
  setUiLanguage(language);
  const { useAppStore } = await import("./store");
  useAppStore.setState({ language: contentLanguageForUserLanguage(language) });
  window.dispatchEvent(new CustomEvent(userPreferencesChangedEvent));
  return next;
};

export const reconcileCanonicalLanguageAfterAuth = async () => {
  const [{ getCurrentUserKey, isTrustedAuthReady }, { supabase }] = await Promise.all([
    import("./authSession"),
    import("./supabase"),
  ]);
  if (!isTrustedAuthReady()) return false;
  const userKey = getCurrentUserKey();
  if (!userKey || userKey === "unauthenticated") return false;

  const preferences = readUserPreferences();
  if (preferences.language && preferences.languageSource === "explicit") {
    return persistCanonicalLanguage(preferences.language);
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("language_code")
    .eq("user_key", userKey)
    .maybeSingle<{ language_code: string | null }>();
  if (error) return false;
  const serverLanguage = parseUserLanguage(data?.language_code);
  if (!serverLanguage) return false;
  await applyCanonicalLanguageLocally(serverLanguage, "server");
  return true;
};

export const updateUserPreferences = (patch: Partial<UserPreferences>): UserPreferences => {
  const selectedUiLanguage = explicitUiLanguageForPatch(patch);
  const effectivePatch = selectedUiLanguage
    ? { ...patch, language: selectedUiLanguage, languageSource: "explicit" as const }
    : patch;
  const next = normalizeUserPreferences({ ...readUserPreferences(), ...effectivePatch });
  localStorage.setItem(userPreferencesStorageKey, JSON.stringify(next));
  if (next.language) localStorage.setItem(legacyLanguageStorageKey, contentLanguageForUserLanguage(next.language));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(userPreferencesChangedEvent));
  if (next.language && next.languageSource === "explicit") {
    void persistCanonicalLanguage(next.language).catch(() => undefined);
  }
  return next;
};

if (typeof window !== "undefined") {
  window.addEventListener(trustedAuthSessionChangedEvent, () => {
    void reconcileCanonicalLanguageAfterAuth().catch(() => undefined);
  });
}

export const clearMapProviderPreference = (): UserPreferences => updateUserPreferences({ mapProvider: null });
export const clearCalendarProviderPreference = (): UserPreferences => updateUserPreferences({ calendarProvider: null });
export const clearShareProviderPreference = (): UserPreferences => updateUserPreferences({ shareProvider: null });
export const clearReminderProviderPreference = (): UserPreferences => updateUserPreferences({ reminderProvider: null });
