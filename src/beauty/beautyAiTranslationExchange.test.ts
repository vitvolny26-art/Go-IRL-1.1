import { describe, expect, it } from "vitest";
import editorSource from "./BeautyWorkspaceContentEditor.tsx?raw";
import {
  applyBeautyAiTranslationResponse,
  beautyAiProfileTranslationKeys,
  buildBeautyAiTranslationPrompt,
} from "./beautyAiTranslationExchange";
import {
  createBeautyPortfolioItem,
  createDefaultBeautyWorkspace,
  type BeautyLocalizedText,
} from "./beautySetupModel";

const localized = (prefix: string): BeautyLocalizedText => ({
  ru: `${prefix}-ru`,
  uk: `${prefix}-uk`,
  cs: `${prefix}-cs`,
  en: `${prefix}-en`,
});

const buildResponse = (workspace: ReturnType<typeof createDefaultBeautyWorkspace>) => ({
  version: 1,
  profile: Object.fromEntries(beautyAiProfileTranslationKeys.map((key) => [key, localized(key)])),
  services: workspace.services.map((service) => ({ id: service.id, nameByLanguage: localized(`service-${service.id}`) })),
  portfolio: workspace.portfolio.map((item) => ({ id: item.id, altByLanguage: localized(`portfolio-${item.id}`) })),
});

describe("GROOMING002-G AI translation exchange", () => {
  it("builds a strict prompt from the selected native language and stable ids", () => {
    const workspace = createDefaultBeautyWorkspace("ru");
    workspace.profile.descriptionByLanguage.ru = "Барбер в центре";
    workspace.services[0].nameByLanguage.ru = "Стрижка";
    const portfolio = createBeautyPortfolioItem(0, "work-one");
    portfolio.altByLanguage.ru = "Фейд";
    workspace.portfolio = [portfolio];

    const prompt = buildBeautyAiTranslationPrompt(workspace, "ru", "barber");

    expect(prompt).toContain("source language is RU");
    expect(prompt).toContain("Return ONLY valid JSON");
    expect(prompt).toContain("Барбер в центре");
    expect(prompt).toContain(workspace.services[0].id);
    expect(prompt).toContain("work-one");
    expect(prompt).toContain('"targetLanguages"');
  });

  it("applies every target language atomically while preserving the native source and non-localized values", () => {
    const workspace = createDefaultBeautyWorkspace("ru");
    workspace.profile.displayName = "Barber";
    workspace.profile.descriptionByLanguage.ru = "Исходное описание";
    workspace.services[0].nameByLanguage.ru = "Исходная стрижка";
    workspace.services[0].priceCzk = 777;
    const portfolio = createBeautyPortfolioItem(0, "work-one");
    portfolio.altByLanguage.ru = "Исходное фото";
    workspace.portfolio = [portfolio];

    const response = buildResponse(workspace);
    response.profile.descriptionByLanguage.ru = "ИИ не должен заменить источник";
    response.services[0].nameByLanguage.ru = "ИИ не должен заменить услугу";
    response.portfolio[0].altByLanguage.ru = "ИИ не должен заменить фото";

    const next = applyBeautyAiTranslationResponse(workspace, "ru", `\`\`\`json\n${JSON.stringify(response)}\n\`\`\``);

    expect(next.profile.descriptionByLanguage.ru).toBe("Исходное описание");
    expect(next.profile.descriptionByLanguage.cs).toBe("descriptionByLanguage-cs");
    expect(next.services[0].nameByLanguage.ru).toBe("Исходная стрижка");
    expect(next.services[0].nameByLanguage.en).toContain("service-");
    expect(next.portfolio[0].altByLanguage.ru).toBe("Исходное фото");
    expect(next.portfolio[0].altByLanguage.uk).toContain("portfolio-work-one");
    expect(next.profile.displayName).toBe("Barber");
    expect(next.services[0].priceCzk).toBe(777);
  });

  it("rejects malformed or partial AI responses instead of partially overwriting content", () => {
    const workspace = createDefaultBeautyWorkspace("ru");
    const response = buildResponse(workspace);
    response.services = [];

    expect(() => applyBeautyAiTranslationResponse(workspace, "ru", JSON.stringify(response))).toThrow("services_missing");
    expect(() => applyBeautyAiTranslationResponse(workspace, "ru", "not json")).toThrow("invalid:json");
  });

  it("wires copy and import controls into the content editor", () => {
    expect(editorSource).toContain("buildBeautyAiTranslationPrompt");
    expect(editorSource).toContain("applyBeautyAiTranslationResponse");
    expect(editorSource).toContain("translationText.copyPrompt");
    expect(editorSource).toContain("translationText.importAll");
    expect(editorSource).toContain("translationText.apply");
  });
});
