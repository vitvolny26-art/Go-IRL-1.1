import { describe, expect, it } from "vitest";
import pageSource from "./BeautyMasterWorkspacePage.tsx?raw";
import editorSource from "./BeautyWorkspaceContentEditor.tsx?raw";

describe("profession-driven master workspace", () => {
  it("selects profession on the master page and applies it globally", () => {
    expect(pageSource).toContain("beauty-profession-picker");
    expect(pageSource).toContain("applyBeautyProfession(workspace, profession)");
    expect(pageSource).toContain("beautyProfessionIds.map");
  });

  it("does not expose profession as a per-service editor field", () => {
    expect(editorSource).not.toContain("beautyServiceSpecializations.map");
    expect(editorSource).not.toContain("updateService(index, { specialization:");
  });

  it("offers service variants from the selected profession registry", () => {
    expect(editorSource).toContain("professionServiceSuggestions(professionId, contentLanguage)");
    expect(editorSource).toContain("createBeautyProfessionService(language, professionId");
  });
});
