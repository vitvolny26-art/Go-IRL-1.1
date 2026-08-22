import type { ProfileRepository } from "../profile/profileRepository";
import type { UserProfile, UserProfileDraft } from "../profile/profileTypes";
import {
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
  userKey: string;
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
  userKey,
  fallbackDisplayName,
}: LoadServicesClientProfileOptions): Promise<ServicesClientProfileProjection> {
  const canonical = await repository.loadOwnProfile();
  const name = canonical?.displayName.trim()
    || readLegacyServicesClientName(storage)
    || fallbackDisplayName.trim();

  return {
    name,
    preferences: readServicesClientPreferences(storage, userKey),
  };
}

export async function saveServicesClientProfileProjection({
  repository,
  storage,
  userKey,
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

  writeServicesClientPreferences(storage, userKey, profile.preferences);
  const preferences = readServicesClientPreferences(storage, userKey);

  return { name: saved.displayName, preferences };
}
