import {
  beautyTranslationLanguages,
  primaryBeautySpecialization,
  resolveBeautyLocalizedText,
  type BeautyContentLanguage,
  type BeautyPublicService,
  type BeautyWorkspace,
} from "./beautySetupModel";
import { beautySpecializationPresentation } from "./beautySpecializationPresentation";

export type BeautyShareCardService = Pick<BeautyPublicService, "id" | "name" | "priceCzk">;

export const resolveBeautyShareCardServices = (
  workspace: BeautyWorkspace,
  language: BeautyContentLanguage,
): BeautyShareCardService[] => {
  const active = workspace.services
    .filter((service) => service.active)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const byId = new Map(active.map((service) => [service.id, service]));
  const selected = workspace.shareCard.serviceIds
    .map((id) => byId.get(id))
    .filter((service): service is NonNullable<typeof service> => Boolean(service));
  const source = selected.length ? selected : active;
  return source.slice(0, 3).map((service) => ({
    id: service.id,
    name: resolveBeautyLocalizedText(service.nameByLanguage, language, service.name),
    priceCzk: service.priceCzk,
  }));
};

const hash = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

const beautyShareAssetPathPattern = /\/beauty-share-card\/(?:background|logo)\/([a-z0-9_-]+)\.(?:jpe?g|png|webp)$/iu;

export const resolveBeautyShareImageIdentity = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:image/")) return `asset:${hash(trimmed)}`;

  try {
    const url = new URL(trimmed, "https://goirl.local");
    const path = decodeURIComponent(url.pathname);
    const assetMatch = path.match(beautyShareAssetPathPattern);
    if (assetMatch) return `asset:${assetMatch[1].toLowerCase()}`;
    if (/^https?:\/\//iu.test(trimmed)) return `${url.origin}${url.pathname}`;
    return `${url.pathname}${url.hash}`;
  } catch {
    return trimmed.replace(/[?#].*$/u, "");
  }
};

export const buildBeautyShareImageAssetKey = (value: string) => {
  const identity = resolveBeautyShareImageIdentity(value);
  return identity.startsWith("asset:") ? identity.slice("asset:".length) : hash(identity);
};

export const buildBeautyShareCardFingerprint = (
  workspace: BeautyWorkspace,
) => hash(JSON.stringify({
  version: 11,
  serviceSpecialization: primaryBeautySpecialization(workspace),
  defaultArtwork: beautySpecializationPresentation[primaryBeautySpecialization(workspace)].defaultArtwork,
  displayName: workspace.profile.displayName,
  publicLocation: workspace.profile.publicLocation,
  city: workspace.profile.city,
  localized: beautyTranslationLanguages.map((language) => ({
    language,
    specialization: resolveBeautyLocalizedText(
      workspace.profile.specializationByLanguage,
      language,
      resolveBeautyLocalizedText(workspace.profile.descriptionByLanguage, language, workspace.profile.description),
    ),
    services: resolveBeautyShareCardServices(workspace, language),
  })),
  backgroundImage: resolveBeautyShareImageIdentity(workspace.shareCard.backgroundImageDataUrl),
  logoImage: resolveBeautyShareImageIdentity(workspace.shareCard.logoImageDataUrl),
  backgroundPositionY: workspace.shareCard.backgroundPositionY,
}));

export const formatBeautyShareCardPublicLink = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "goirl.app";
  try {
    const url = new URL(trimmed, "https://goirl.app");
    return `${url.hostname}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return trimmed.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
};
