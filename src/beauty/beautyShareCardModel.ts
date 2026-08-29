import type { Language } from "../types";
import {
  primaryBeautySpecialization,
  resolveBeautyLocalizedText,
  type BeautyPublicService,
  type BeautyWorkspace,
} from "./beautySetupModel";
import { beautySpecializationPresentation } from "./beautySpecializationPresentation";

export type BeautyShareCardService = Pick<BeautyPublicService, "id" | "name" | "priceCzk">;

export const resolveBeautyShareCardServices = (
  workspace: BeautyWorkspace,
  language: Language,
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

export const buildBeautyShareCardFingerprint = (
  workspace: BeautyWorkspace,
  language: Language,
) => hash(JSON.stringify({
  version: 6,
  language,
  serviceSpecialization: primaryBeautySpecialization(workspace),
  defaultArtwork: beautySpecializationPresentation[primaryBeautySpecialization(workspace)].defaultArtwork,
  displayName: workspace.profile.displayName,
  specialization: resolveBeautyLocalizedText(
    workspace.profile.specializationByLanguage,
    language,
    resolveBeautyLocalizedText(workspace.profile.descriptionByLanguage, language, workspace.profile.description),
  ),
  publicLocation: workspace.profile.publicLocation,
  city: workspace.profile.city,
  services: resolveBeautyShareCardServices(workspace, language),
  backgroundImage: hash(workspace.shareCard.backgroundImageDataUrl),
  logoImage: hash(workspace.shareCard.logoImageDataUrl),
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