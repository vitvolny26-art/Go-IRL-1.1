import { describe, expect, it } from "vitest";
import { createDefaultBeautyWorkspace, withBeautyServices } from "./beautySetupModel";
import {
  beautySpecializationPresentation,
  resolveBeautySpecializationPresentation,
} from "./beautySpecializationPresentation";

describe("Grooming specialization presentation", () => {
  it("keeps manicure artwork only in the Nails preset", () => {
    expect(beautySpecializationPresentation.nails.defaultArtwork).toContain("s-01-manicure.webp");
    expect(beautySpecializationPresentation.barber.defaultArtwork).toContain("s-02-barber.webp");
    expect(beautySpecializationPresentation.barber.defaultArtwork).not.toContain("manicure");
  });

  it("derives public presentation from the first active service", () => {
    let workspace = createDefaultBeautyWorkspace("en");
    workspace = withBeautyServices(workspace, workspace.services.map((service) => ({
      ...service,
      specialization: "barber" as const,
    })));

    const presentation = resolveBeautySpecializationPresentation(workspace);
    expect(presentation.specialization).toBe("barber");
    expect(presentation.publicLabel).toBe("Barbering");
    expect(presentation.workspaceTitle.en).toBe("Barber workspace");
  });
});
