import type { Language } from "../types";
import {
  beautyContentLanguages,
  withBeautyServices,
  type BeautyLocalizedText,
  type BeautyWorkspace,
} from "./beautySetupModel";

export const beautyAiProfileTranslationKeys = [
  "descriptionByLanguage",
  "experienceByLanguage",
  "specializationByLanguage",
  "hygieneByLanguage",
  "materialsByLanguage",
  "spokenLanguagesByLanguage",
  "certificatesByLanguage",
  "bookingNotesByLanguage",
] as const;

type BeautyAiProfileTranslationKey = (typeof beautyAiProfileTranslationKeys)[number];
type UnknownRecord = Record<string, unknown>;

type BeautyAiTranslationPayload = {
  profile: Record<BeautyAiProfileTranslationKey, BeautyLocalizedText>;
  services: Map<string, BeautyLocalizedText>;
  portfolio: Map<string, BeautyLocalizedText>;
};

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const emptyLocalizedText = (): BeautyLocalizedText => ({ ru: "", uk: "", cs: "", en: "" });

const readLocalizedText = (value: unknown, path: string): BeautyLocalizedText => {
  if (!isRecord(value)) throw new Error(`beauty_ai_translation_invalid:${path}`);
  const localized = emptyLocalizedText();
  for (const language of beautyContentLanguages) {
    if (typeof value[language] !== "string") throw new Error(`beauty_ai_translation_invalid:${path}.${language}`);
    localized[language] = value[language];
  }
  return localized;
};

const stripJsonFence = (value: string) => {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
};

const parseTranslationPayload = (workspace: BeautyWorkspace, raw: string): BeautyAiTranslationPayload => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error("beauty_ai_translation_invalid:json");
  }
  if (!isRecord(parsed) || parsed.version !== 1) throw new Error("beauty_ai_translation_invalid:version");
  if (!isRecord(parsed.profile)) throw new Error("beauty_ai_translation_invalid:profile");

  const profile = {} as Record<BeautyAiProfileTranslationKey, BeautyLocalizedText>;
  for (const key of beautyAiProfileTranslationKeys) profile[key] = readLocalizedText(parsed.profile[key], `profile.${key}`);

  if (!Array.isArray(parsed.services)) throw new Error("beauty_ai_translation_invalid:services");
  const serviceIds = new Set(workspace.services.map((service) => service.id));
  const services = new Map<string, BeautyLocalizedText>();
  for (const value of parsed.services) {
    if (!isRecord(value) || typeof value.id !== "string" || !serviceIds.has(value.id) || services.has(value.id)) {
      throw new Error("beauty_ai_translation_invalid:service_id");
    }
    services.set(value.id, readLocalizedText(value.nameByLanguage, `services.${value.id}.nameByLanguage`));
  }
  if (services.size !== workspace.services.length) throw new Error("beauty_ai_translation_invalid:services_missing");

  if (!Array.isArray(parsed.portfolio)) throw new Error("beauty_ai_translation_invalid:portfolio");
  const portfolioIds = new Set(workspace.portfolio.map((item) => item.id));
  const portfolio = new Map<string, BeautyLocalizedText>();
  for (const value of parsed.portfolio) {
    if (!isRecord(value) || typeof value.id !== "string" || !portfolioIds.has(value.id) || portfolio.has(value.id)) {
      throw new Error("beauty_ai_translation_invalid:portfolio_id");
    }
    portfolio.set(value.id, readLocalizedText(value.altByLanguage, `portfolio.${value.id}.altByLanguage`));
  }
  if (portfolio.size !== workspace.portfolio.length) throw new Error("beauty_ai_translation_invalid:portfolio_missing");

  return { profile, services, portfolio };
};

const preserveSource = (current: BeautyLocalizedText, incoming: BeautyLocalizedText, sourceLanguage: Language): BeautyLocalizedText => ({
  ...incoming,
  [sourceLanguage]: current[sourceLanguage],
});

export const buildBeautyAiTranslationPrompt = (
  workspace: BeautyWorkspace,
  sourceLanguage: Language,
  profession: string,
) => {
  const input = {
    version: 1,
    sourceLanguage,
    targetLanguages: beautyContentLanguages,
    profession,
    context: {
      displayName: workspace.profile.displayName,
      city: workspace.profile.city,
      publicLocation: workspace.profile.publicLocation,
    },
    profile: Object.fromEntries(beautyAiProfileTranslationKeys.map((key) => [key, workspace.profile[key][sourceLanguage]])),
    services: workspace.services.map((service) => ({ id: service.id, text: service.nameByLanguage[sourceLanguage] })),
    portfolio: workspace.portfolio.map((item) => ({ id: item.id, text: item.altByLanguage[sourceLanguage] })),
  };

  const outputShape = {
    version: 1,
    profile: Object.fromEntries(beautyAiProfileTranslationKeys.map((key) => [key, emptyLocalizedText()])),
    services: workspace.services.map((service) => ({ id: service.id, nameByLanguage: emptyLocalizedText() })),
    portfolio: workspace.portfolio.map((item) => ({ id: item.id, altByLanguage: emptyLocalizedText() })),
  };

  return [
    "Translate the GO IRL beauty professional content below into RU, UK, CS and EN.",
    `The source language is ${sourceLanguage.toUpperCase()}.`,
    "Return ONLY valid JSON. Do not use Markdown fences, commentary, headings or notes.",
    "Keep the exact object structure and every supplied service/portfolio id.",
    "Translate only the text fields present in INPUT. If a source field is empty, keep it empty in every language.",
    "Do not invent facts. Preserve names, brands, addresses, URLs, phone numbers, numbers and professional terminology accurately.",
    "For the source-language value, copy the original text exactly. Produce natural localized wording for the other languages.",
    "INPUT:",
    JSON.stringify(input, null, 2),
    "OUTPUT SHAPE:",
    JSON.stringify(outputShape, null, 2),
  ].join("\n\n");
};

export const applyBeautyAiTranslationResponse = (
  workspace: BeautyWorkspace,
  sourceLanguage: Language,
  raw: string,
): BeautyWorkspace => {
  const payload = parseTranslationPayload(workspace, raw);
  const translatedProfile = Object.fromEntries(
    beautyAiProfileTranslationKeys.map((key) => [key, preserveSource(workspace.profile[key], payload.profile[key], sourceLanguage)]),
  ) as Pick<BeautyWorkspace["profile"], BeautyAiProfileTranslationKey>;

  const services = workspace.services.map((service) => ({
    ...service,
    nameByLanguage: preserveSource(service.nameByLanguage, payload.services.get(service.id)!, sourceLanguage),
  }));
  const portfolio = workspace.portfolio.map((item) => ({
    ...item,
    altByLanguage: preserveSource(item.altByLanguage, payload.portfolio.get(item.id)!, sourceLanguage),
  }));

  return withBeautyServices({
    ...workspace,
    profile: { ...workspace.profile, ...translatedProfile },
    portfolio,
  }, services);
};
