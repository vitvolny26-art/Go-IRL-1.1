export const profileVerticalPreferencesStorageKey = "go-irl-uprofile-vertical-preferences-v1";
export const legacyServicesClientProfileStorageKey = "go-irl-services-client-profile-v1";

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

export type ProfilePreferenceStorage = Pick<Storage, "getItem" | "setItem">;

type LegacyServicesClientProfile = {
  name?: unknown;
  preferences?: unknown;
};

const emptyState = (): ProfileVerticalPreferences => ({ services: [] });

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

const readLegacyServicesPreferences = (storage: ProfilePreferenceStorage): ServicePreferenceId[] =>
  normalizeServicePreferences(readLegacyServicesClientProfile(storage).preferences);

export const writeProfileVerticalPreferences = (
  storage: ProfilePreferenceStorage,
  state: ProfileVerticalPreferences,
): ProfileVerticalPreferences => {
  const normalized = normalizeProfileVerticalPreferences(state);
  storage.setItem(profileVerticalPreferencesStorageKey, JSON.stringify(normalized));
  return normalized;
};

export const readProfileVerticalPreferences = (
  storage: ProfilePreferenceStorage,
): ProfileVerticalPreferences => {
  const stored = storage.getItem(profileVerticalPreferencesStorageKey);
  if (stored) {
    try {
      return normalizeProfileVerticalPreferences(JSON.parse(stored));
    } catch {
      // Fall through to compatibility migration.
    }
  }

  const migrated = { services: readLegacyServicesPreferences(storage) };
  if (storage.getItem(legacyServicesClientProfileStorageKey)) {
    writeProfileVerticalPreferences(storage, migrated);
  }
  return migrated;
};

export const readServicesClientPreferences = (
  storage: ProfilePreferenceStorage,
): string[] => readProfileVerticalPreferences(storage).services
  .map((id) => servicePreferenceLegacyValueById[id]);

export const writeServicesClientPreferences = (
  storage: ProfilePreferenceStorage,
  preferences: readonly string[],
): ProfileVerticalPreferences => writeProfileVerticalPreferences(storage, {
  ...readProfileVerticalPreferences(storage),
  services: normalizeServicePreferences(preferences),
});
