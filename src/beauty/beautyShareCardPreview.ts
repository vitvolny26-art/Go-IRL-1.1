import { buildTelegramBeautyShareCardSvg } from "../../api/_shared/beauty-share-card-svg.js";
import type { TelegramEventCardInput } from "../../api/_shared/telegram-event-card.js";
import type { Language } from "../types";
import { resolveBeautyLocalizedText, type BeautyWorkspace } from "./beautySetupModel";
import { resolveBeautyShareCardServices } from "./beautyShareCardModel";
import { resolveBeautySpecializationPresentation } from "./beautySpecializationPresentation";

export const buildBeautyShareCardPreviewInput = (
  workspace: BeautyWorkspace,
  language: Language,
): TelegramEventCardInput => {
  const presentation = resolveBeautySpecializationPresentation(workspace);
  const services = resolveBeautyShareCardServices(workspace, language);
  const primaryService = services[0] || {
    name: resolveBeautyLocalizedText(workspace.service.nameByLanguage, language, workspace.service.name),
    priceCzk: workspace.service.priceCzk,
  };
  const description = resolveBeautyLocalizedText(
    workspace.profile.specializationByLanguage,
    language,
    resolveBeautyLocalizedText(
      workspace.profile.descriptionByLanguage,
      language,
      workspace.profile.description,
    ),
  ).trim() || primaryService.name;
  const publicLocation = workspace.profile.publicLocation || workspace.profile.city;
  const displayName = workspace.profile.displayName.trim() || "GO IRL Beauty";

  return {
    eventId: "beauty-share-card-preview",
    title: primaryService.name,
    activity: displayName,
    description,
    date: "",
    eventDate: "",
    time: "",
    address: publicLocation,
    participants: 0,
    capacity: 0,
    icon: "✨",
    inviteUrl: workspace.publicLink || "https://t.me/GOirl_bot",
    publicProfileUrl: workspace.publicLink || undefined,
    beautyServices: services.map((service) => ({
      name: service.name,
      priceCzk: service.priceCzk,
    })),
    city: workspace.profile.city,
    organizer: displayName,
    durationMinutes: workspace.service.durationMinutes,
    price: primaryService.priceCzk,
    level: presentation.publicLabel,
    format: `${workspace.service.durationMinutes} min`,
    environment: publicLocation,
    isSport: false,
    language,
  };
};

export const buildBeautyShareCardPreviewSvg = (
  workspace: BeautyWorkspace,
  language: Language,
) => buildTelegramBeautyShareCardSvg(buildBeautyShareCardPreviewInput(workspace, language));
