import { describe, expect, it } from "vitest";
import type { ProfileRepository } from "../profile/profileRepository";
import type { UserProfile, UserProfileDraft } from "../profile/profileTypes";
import {
  legacyServicesClientProfileStorageKey,
  profileVerticalPreferencesStorageKey,
} from "../profile/profileVerticalPreferences";
import {
  loadServicesClientProfileProjection,
  saveServicesClientProfileProjection,
} from "./servicesClientProfileProjection";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const canonicalProfile: UserProfile = {
  userKey: "guest:test",
  displayName: "Canonical name",
  bio: "Keep this bio",
  cityId: "olomouc",
  avatarPath: "data:image/png;base64,abc",
  avatarCode: null,
  isPublic: false,
  showFavorites: false,
  favoriteActivityIds: ["coffee", "running"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

const repositoryWith = (profile: UserProfile | null, onSave?: (draft: UserProfileDraft) => void) => ({
  loadOwnProfile: async () => profile,
  saveOwnProfile: async (draft: UserProfileDraft) => {
    onSave?.(draft);
    return {
      ...(profile ?? canonicalProfile),
      displayName: draft.displayName,
      bio: draft.bio,
      cityId: draft.cityId,
      avatarPath: draft.avatarPath,
      avatarCode: draft.avatarCode,
      isPublic: draft.isPublic,
      showFavorites: draft.showFavorites,
      favoriteActivityIds: draft.favoriteActivityIds,
    };
  },
}) as unknown as ProfileRepository;

describe("Services client profile projection", () => {
  it("prefers canonical identity over the legacy Services name", async () => {
    const storage = new MemoryStorage();
    storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify({ name: "Legacy name", preferences: ["Маникюр"] }));

    await expect(loadServicesClientProfileProjection({
      repository: repositoryWith(canonicalProfile),
      storage,
      fallbackDisplayName: "Fallback",
    })).resolves.toEqual({ name: "Canonical name", preferences: ["Маникюр"] });
  });

  it("reads through the legacy Services name only when canonical identity is absent", async () => {
    const storage = new MemoryStorage();
    storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify({ name: " Legacy name ", preferences: [] }));

    await expect(loadServicesClientProfileProjection({
      repository: repositoryWith(null),
      storage,
      fallbackDisplayName: "Fallback",
    })).resolves.toEqual({ name: "Legacy name", preferences: [] });
  });

  it("writes displayName through ProfileRepository without leaking Services into shared fields", async () => {
    const storage = new MemoryStorage();
    let savedDraft: UserProfileDraft | null = null;

    const saved = await saveServicesClientProfileProjection({
      repository: repositoryWith(canonicalProfile, (draft) => { savedDraft = draft; }),
      storage,
      fallbackDisplayName: "Fallback",
      fallbackCityId: "prague",
      profile: { name: " Updated name ", preferences: ["Волосы", "facial", "unsupported"] },
    });

    expect(savedDraft).toEqual({
      displayName: "Updated name",
      bio: "Keep this bio",
      cityId: "olomouc",
      avatarPath: "data:image/png;base64,abc",
      avatarCode: null,
      isPublic: false,
      showFavorites: false,
      favoriteActivityIds: ["coffee", "running"],
    });
    expect(saved).toEqual({ name: "Updated name", preferences: ["Волосы", "Уход за лицом"] });
    expect(storage.getItem(profileVerticalPreferencesStorageKey)).toBe(JSON.stringify({ services: ["hair", "facial"] }));
    expect(storage.getItem(legacyServicesClientProfileStorageKey)).toBe(JSON.stringify({
      name: "Updated name",
      preferences: ["Волосы", "Уход за лицом"],
    }));
  });
});
