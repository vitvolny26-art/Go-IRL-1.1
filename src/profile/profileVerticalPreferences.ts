export const profileVerticalPreferencesStorageKey = "go-irl-uprofile-vertical-preferences-v1";
export const legacyServicesClientProfileStorageKey = "go-irl-services-client-profile-v1";
export const profileVerticalPreferencesChangedEvent = "go-irl:profile-vertical-preferences-changed";
const profileVerticalPreferencesLegacyOwnerStorageKey = `${profileVerticalPreferencesStorageKey}:legacy-owner`;

export const servicePreferenceIds = [
  "manicure",
  "hair",
  "brows-lashes",
  "massage",
  "facial",
] as const;

export type ServicePreferenceId = typeof servicePreferenceIds[number];

export type ProfileVerticalPreferences = {
  services: ServicePreferenceId[];
};

export type ProfilePreferenceStorage = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>;

type LegacyServicesClientProfile = {
  name?: unknown;
  preferences?: unknown;
};

type ProfileVerticalPreferencesChangedDetail = {
  userKey: string;
};

const emptyState = (): ProfileVerticalPreferences => ({ services: [] });
const normalizeUserKey = (userKey: string) => userKey.trim() || "unauthenticated";

export const profileVerticalPreferencesStorageKeyForUser = (userKey: string) =>
  `${profileVerticalPreferencesStorageKey}:${encodeURIComponent(normalizeUserKey(userKey))}`;

const servicePreferenceLegacyValueById: Readonly<Record<ServicePreferenceId, string>> = {
  manicure: "Маникюр",
  hair: "Волосы",
  "brows-lashes": "Брови и ресницы",
  massage: "Массаж",
  facial: "Уход за лицом",
};

const servicePreferenceIdByValue: Readonly<Record<string, ServicePreferenceId>> = {
  manicure: "manicure",
  "Маникюр": "manicure",
  hair: "hair",
  "Волосы": "hair",
  "brows-lashes": "brows-lashes",
  "Брови и ресницы": "brows-lashes",
  massage: "massage",
  "Массаж": "massage",
  facial: "facial",
  "Уход за лицом": "facial",
};

const normalizeServicePreferences = (value: unknown): ServicePreferenceId[] => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => servicePreferenceIdByValue[item])
    .filter((item): item is ServicePreferenceId => Boolean(item));
  return [...new Set(normalized)];
};

export const normalizeProfileVerticalPreferences = (value: unknown): ProfileVerticalPreferences => {
  if (!value || typeof value !== "object") return emptyState();
  return {
    services: normalizeServicePreferences((value as Partial<ProfileVerticalPreferences>).services),
  };
};

const readLegacyServicesClientProfile = (storage: ProfilePreferenceStorage): LegacyServicesClientProfile => {
  const stored = storage.getItem(legacyServicesClientProfileStorageKey);
  if (!stored) return {};
  try {
    const value: unknown = JSON.parse(stored);
    return value && typeof value === "object" ? value as LegacyServicesClientProfile : {};
  } catch {
    return {};
  }
};

export const readLegacyServicesClientName = (storage: ProfilePreferenceStorage): string => {
  const name = readLegacyServicesClientProfile(storage).name;
  return typeof name === "string" ? name.trim() : "";
};

const hasLegacyServicesPreferences = (profile: LegacyServicesClientProfile) =>
  Object.prototype.hasOwnProperty.call(profile, "preferences");

const cleanupLegacyPreferenceState = (
  storage: ProfilePreferenceStorage,
  legacyServicesProfile: LegacyServicesClientProfile,
) => {
  storage.removeItem?.(profileVerticalPreferencesStorageKey);

  if (!hasLegacyServicesPreferences(legacyServicesProfile)) return;

  const cleanedLegacyProfile = { ...legacyServicesProfile };
  delete cleanedLegacyProfile.preferences;

  if (Object.keys(cleanedLegacyProfile).length === 0 && storage.removeItem) {
    storage.removeItem(legacyServicesClientProfileStorageKey);
    return;
  }

  storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify(cleanedLegacyProfile));
};

const readStoredPreferences = (storage: ProfilePreferenceStorage, storageKey: string) => {
  const stored = storage.getItem(storageKey);
  if (!stored) return null;
  try {
    return normalizeProfileVerticalPreferences(JSON.parse(stored));
  } catch {
    return null;
  }
};

const notifyProfileVerticalPreferencesChanged = (
  storage: ProfilePreferenceStorage,
  userKey: string,
) => {
  if (typeof window === "undefined" || storage !== window.localStorage) return;
  window.dispatchEvent(new CustomEvent<ProfileVerticalPreferencesChangedDetail>(
    profileVerticalPreferencesChangedEvent,
    { detail: { userKey: normalizeUserKey(userKey) } },
  ));
};

export const writeProfileVerticalPreferences = (
  storage: ProfilePreferenceStorage,
  userKey: string,
  state: ProfileVerticalPreferences,
): ProfileVerticalPreferences => {
  const normalized = normalizeProfileVerticalPreferences(state);
  storage.setItem(profileVerticalPreferencesStorageKeyForUser(userKey), JSON.stringify(normalized));
  notifyProfileVerticalPreferencesChanged(storage, userKey);
  return normalized;
};

export const readProfileVerticalPreferences = (
  storage: ProfilePreferenceStorage,
  userKey: string,
): ProfileVerticalPreferences => {
  const normalizedUserKey = normalizeUserKey(userKey);
  const scopedStorageKey = profileVerticalPreferencesStorageKeyForUser(normalizedUserKey);
  const scoped = readStoredPreferences(storage, scopedStorageKey);
  if (scoped) {
    const legacyOwner = storage.getItem(profileVerticalPreferencesLegacyOwnerStorageKey);
    if (legacyOwner === normalizedUserKey) {
      cleanupLegacyPreferenceState(storage, readLegacyServicesClientProfile(storage));
    }
    return scoped;
  }

  if (normalizedUserKey === "unauthenticated") return emptyState();

  const legacyOwner = storage.getItem(profileVerticalPreferencesLegacyOwnerStorageKey);
  if (legacyOwner && legacyOwner !== normalizedUserKey) return emptyState();

  const unscopedCanonical = readStoredPreferences(storage, profileVerticalPreferencesStorageKey);
  const legacyServicesProfile = readLegacyServicesClientProfile(storage);
  if (!unscopedCanonical && !hasLegacyServicesPreferences(legacyServicesProfile)) return emptyState();

  const migrated = unscopedCanonical ?? {
    services: normalizeServicePreferences(legacyServicesProfile.preferences),
  };
  storage.setItem(scopedStorageKey, JSON.stringify(migrated));
  if (!legacyOwner) {
    storage.setItem(profileVerticalPreferencesLegacyOwnerStorageKey, normalizedUserKey);
  }
  cleanupLegacyPreferenceState(storage, legacyServicesProfile);
  return migrated;
};

export const readServicesClientPreferences = (
  storage: ProfilePreferenceStorage,
  userKey: string,
): string[] => readProfileVerticalPreferences(storage, userKey).services
  .map((id) => servicePreferenceLegacyValueById[id]);

export const writeServicesClientPreferences = (
  storage: ProfilePreferenceStorage,
  userKey: string,
  preferences: readonly string[],
): ProfileVerticalPreferences => writeProfileVerticalPreferences(storage, userKey, {
  ...readProfileVerticalPreferences(storage, userKey),
  services: normalizeServicePreferences(preferences),
});
