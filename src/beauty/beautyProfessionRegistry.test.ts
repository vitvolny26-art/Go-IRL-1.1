import { describe, expect, it } from "vitest";
import { createDefaultBeautyWorkspace } from "./beautySetupModel";
import { applyBeautyProfession, beautyProfessionIds, beautyProfessionRegistry, createBeautyProfessionService, professionServiceSuggestions, resolveBeautyProfessionId } from "./beautyProfessionRegistry";

describe("beauty profession registry", () => {
  it("keeps current professions in one extensible registry", () => {
    expect(beautyProfessionIds).toEqual(["nails", "barber"]);
    expect(beautyProfessionRegistry.barber.defaultArtwork).toContain("s-02-barber.webp");
    expect(beautyProfessionRegistry.barber.defaultIcon).toContain("s-02-barber.webp");
    expect(beautyProfessionRegistry.nails.defaultArtwork).toContain("s-01-manicure.webp");
  });

  it("applies profession to every service and invalidates generated share output", () => {
    const workspace = createDefaultBeautyWorkspace("ru");
    const next = applyBeautyProfession(workspace, "barber");
    expect(resolveBeautyProfessionId(next)).toBe("barber");
    expect(next.services.every((service) => service.specialization === "barber")).toBe(true);
    expect(next.shareCard.status).toBe("updating");
    expect(next.shareCard.generatedImageDataUrl).toBe("");
  });

  it("creates profession-specific service defaults and suggestions", () => {
    const service = createBeautyProfessionService("ru", "barber", 0);
    expect(service.specialization).toBe("barber");
    expect(service.name).toBe("Стрижка");
    expect(professionServiceSuggestions("barber", "ru")).toContain("Стрижка бороды");
    expect(professionServiceSuggestions("barber", "pl")).toContain("Beard trim");
    expect(professionServiceSuggestions("barber", "sk")).toContain("Beard trim");
  });
});
