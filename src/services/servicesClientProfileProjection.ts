import type { ProfileRepository } from "../profile/profileRepository";
import type { UserProfile, UserProfileDraft } from "../profile/profileTypes";
import {
  legacyServicesClientProfileStorageKey,
  readLegacyServicesClientName,
  readServicesClientPreferences,
  writeServicesClientPreferences,
} from "../profile/profileVerticalPreferences";

export type ServicesClientProfileProjection = {
  name: string;
  preferences: string[];
};

type LoadServicesClientProfileOptions = {
  repository: ProfileRepository;
  storage: Storage;
  fallbackDisplayName: string;
};

type SaveServicesClientProfileOptions = LoadServicesClientProfileOptions & {
  fallbackCityId: string;
  profile: ServicesClientProfileProjection;
};

const profileDraftWithDisplayName = (
  current: UserProfile | null,
  displayName: string,
  fallbackCityId: string,
): UserProfileDraft => ({
  displayName,
  bio: current?.bio ?? "",
  cityId: current?.cityId || fallbackCityId,
  avatarPath: current?.avatarPath ?? null,
  avatarCode: current ? current.avatarCode : "GI",
  isPublic: current?.isPublic ?? true,
  showFavorites: current?.showFavorites ?? true,
  favoriteActivityIds: current?.favoriteActivityIds ?? [],
});

export async function loadServicesClientProfileProjection({
  repository,
  storage,
  fallbackDisplayName,
}: LoadServicesClientProfileOptions): Promise<ServicesClientProfileProjection> {
  const canonical = await repository.loadOwnProfile();
  const name = canonical?.displayName.trim()
    || readLegacyServicesClientName(storage)
    || fallbackDisplayName.trim();

  return {
    name,
    preferences: readServicesClientPreferences(storage),
  };
}

export async function saveServicesClientProfileProjection({
  repository,
  storage,
  fallbackDisplayName,
  fallbackCityId,
  profile,
}: SaveServicesClientProfileOptions): Promise<ServicesClientProfileProjection> {
  const current = await repository.loadOwnProfile();
  const displayName = profile.name.trim()
    || current?.displayName.trim()
    || fallbackDisplayName.trim();
  const saved = await repository.saveOwnProfile(
    profileDraftWithDisplayName(current, displayName, fallbackCityId),
  );

  writeServicesClientPreferences(storage, profile.preferences);
  const preferences = readServicesClientPreferences(storage);
  storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify({
    name: saved.displayName,
    preferences,
  }));

  return { name: saved.displayName, preferences };
}
