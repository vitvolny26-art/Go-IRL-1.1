import { describe, expect, it } from "vitest";
import settingsSource from "./BeautyWorkspaceSettingsDialog.tsx?raw";
import contentSource from "./BeautyWorkspaceContentEditor.tsx?raw";
import shareCardSource from "./BeautyShareCardEditor.tsx?raw";
import portfolioSource from "./beautyPortfolioUpload.ts?raw";
import storageSource from "./beautyWorkspaceStorage.ts?raw";

describe("Grooming master save and media repair", () => {
  it("bridges the owned profile avatar into an empty share-card logo", () => {
    expect(storageSource).toContain('from("user_profiles")');
    expect(storageSource).toContain('.select("avatar_path")');
    expect(storageSource).toContain(".download(avatarPath)");
    expect(storageSource).toContain("logoImageDataUrl: avatarDataUrl");
    expect(storageSource).toContain('status: "updating" as const');
  });

  it("keeps settings save independent from share-card persistence and exposes the failure reason", () => {
    expect(settingsSource).toContain("saveBeautyWorkspaceProfile(workspace)");
    expect(settingsSource).toContain("describeSaveFailure(error)");
    expect(settingsSource).toContain("{text.errorReason}: {errorReason}");
  });

  it("allows adding a valid persistable service from Settings and the Page price editor", () => {
    expect(settingsSource).toContain("const addService = () =>");
    expect(settingsSource).toContain("<Plus size={18} />{text.addService}");
    expect(settingsSource).toContain("createBeautyProfessionService(language, professionId, editableServices.length)");
    expect(contentSource).toContain("createBeautyProfessionService(language, professionId, workspace.services.length)");
    expect(settingsSource).toContain("professionServiceSuggestions(professionId, language)");
    expect(contentSource).toContain("professionServiceSuggestions(professionId, contentLanguage)");
    expect(contentSource).not.toContain('name: "", nameByLanguage: emptyBeautyLocalizedText()');
  });

  it("uses stable public portfolio URLs and CORS-safe remote card images", () => {
    expect(portfolioSource).toContain('beautyPortfolioBucket = "beauty-share-cards"');
    expect(portfolioSource).toContain("getPublicUrl(path).data.publicUrl");
    expect(shareCardSource).toContain('image.crossOrigin = "anonymous"');
  });
});
