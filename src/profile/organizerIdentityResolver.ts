import { getCurrentAuthIdentity } from "../authSession";
import { supabase } from "../supabase";
import { createProfileRepository, type ProfileRepository } from "./profileRepository";

export type OrganizerIdentity = {
  organizerKey: string;
  displayName: string;
  bio: string;
  cityId: string;
  avatar: string;
};

type PendingRequest = {
  organizerKey: string;
  fallbackName: string;
  resolve: (identity: OrganizerIdentity) => void;
};

const pending: PendingRequest[] = [];
let scheduled = false;
let repositoryOverride: ProfileRepository | null = null;

export const organizerInitials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "GO";

const fallbackIdentity = (organizerKey: string, fallbackName: string): OrganizerIdentity => ({
  organizerKey,
  displayName: fallbackName,
  bio: "",
  cityId: "",
  avatar: organizerInitials(fallbackName),
});

const createRepository = async () => createProfileRepository({
  identity: getCurrentAuthIdentity(),
  supabaseClient: supabase,
  storage: localStorage,
  fallbackDisplayName: "GO IRL User",
  fallbackCityId: "olomouc",
});

const flush = async () => {
  scheduled = false;
  const requests = pending.splice(0, pending.length);
  if (!requests.length) return;

  const keys = [...new Set(requests.map((request) => request.organizerKey).filter(Boolean))];

  try {
    const repository = repositoryOverride || await createRepository();
    const profiles = await repository.loadPublicProfiles(keys);
    await Promise.all(requests.map(async (request) => {
      const profile = profiles.get(request.organizerKey) || null;
      if (!profile) {
        request.resolve(fallbackIdentity(request.organizerKey, request.fallbackName));
        return;
      }

      let avatar = profile.avatarCode || organizerInitials(profile.displayName || request.fallbackName);
      if (profile.avatarPath) {
        try {
          avatar = await repository.resolveAvatarUrl(profile.avatarPath);
        } catch {
          avatar = profile.avatarCode || organizerInitials(profile.displayName || request.fallbackName);
        }
      }

      request.resolve({
        organizerKey: request.organizerKey,
        displayName: profile.displayName || request.fallbackName,
        bio: profile.bio,
        cityId: profile.cityId,
        avatar,
      });
    }));
  } catch {
    requests.forEach((request) => request.resolve(fallbackIdentity(request.organizerKey, request.fallbackName)));
  }
};

export const resolveOrganizerIdentity = (organizerKey: string, fallbackName: string) => new Promise<OrganizerIdentity>((resolve) => {
  pending.push({ organizerKey, fallbackName, resolve });
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { void flush(); });
});

export const setOrganizerIdentityRepositoryForTests = (repository: ProfileRepository | null) => {
  repositoryOverride = repository;
};
