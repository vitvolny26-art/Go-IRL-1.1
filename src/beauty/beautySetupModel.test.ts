import { describe, expect, it } from "vitest";
import {
  BEAUTY_SCHEMA_VERSION,
  buildBeautyPublicProfile,
  createBeautyPortfolioItem,
  createBeautyService,
  createDefaultBeautyWorkspace,
  emptyBeautyLocalizedText,
  getBeautyStepProgress,
  primaryBeautySpecialization,
  resolveBeautyLocalizedText,
  upgradeBeautyWorkspace,
  validateBeautyStep,
  withBeautyServices,
} from "./beautySetupModel";

describe("Beauty setup model", () => {
  it("tracks the four setup steps", () => {
    expect(getBeautyStepProgress("pro_setup_profile")).toEqual({ current: 1, total: 4 });
    expect(getBeautyStepProgress("pro_setup_review")).toEqual({ current: 4, total: 4 });
    expect(getBeautyStepProgress("pro_setup_published")).toBeNull();
  });

  it("keeps private fields out of the public profile", () => {
    const workspace = createDefaultBeautyWorkspace("ru");
    const publicProfile = buildBeautyPublicProfile(workspace, "ru");

    expect(publicProfile.displayName).toBe(workspace.profile.displayName);
    expect(publicProfile.description).toBe(workspace.profile.descriptionByLanguage.ru);
    expect(publicProfile).not.toHaveProperty("contact");
    expect(publicProfile).not.toHaveProperty("exactAddress");
  });

  it("creates all supported translations and resolves the client language", () => {
    const workspace = createDefaultBeautyWorkspace("ru");
    expect(workspace.service.nameByLanguage.ru).toBe("Маникюр с гель-лаком");
    expect(workspace.service.nameByLanguage.en).toBe("Gel manicure");
    expect(workspace.service.nameByLanguage.pl).toBe("");
    expect(workspace.service.nameByLanguage.sk).toBe("");
    expect(emptyBeautyLocalizedText()).toEqual({ ru: "", uk: "", cs: "", en: "", pl: "", sk: "" });
    expect(buildBeautyPublicProfile(workspace, "cs").serviceName).toBe("Manikúra s gel lakem");
  });

  it("uses a deterministic fallback when the requested translation is empty", () => {
    expect(resolveBeautyLocalizedText({ ru: "", uk: "", cs: "", en: "English" }, "ru", "Legacy"))
      .toBe("English");
    expect(resolveBeautyLocalizedText({ ru: "", uk: "", cs: "", en: "" }, "ru", "Legacy"))
      .toBe("Legacy");
  });

  it("upgrades a version 3 workspace into a multi-service workspace without losing the existing service", () => {
    const legacy = createDefaultBeautyWorkspace("ru") as unknown as Record<string, unknown>;
    legacy.schemaVersion = 3;
    delete legacy.services;
    delete legacy.portfolio;
    const service = { ...(legacy.service as Record<string, unknown>) };
    service.name = "Старое название";
    delete service.id;
    delete service.active;
    delete service.sortOrder;
    delete service.specialization;
    legacy.service = service;

    const upgraded = upgradeBeautyWorkspace(legacy, "ru");
    expect(upgraded?.schemaVersion).toBe(BEAUTY_SCHEMA_VERSION);
    expect(upgraded?.services).toHaveLength(1);
    expect(upgraded?.services[0].name).toBe("Старое название");
    expect(upgraded?.service.name).toBe("Старое название");
    expect(upgraded?.service.specialization).toBe("nails");
    expect(upgraded?.shareCard.serviceIds).toEqual([upgraded?.services[0].id]);
    expect(upgraded?.shareCard.status).toBe("updating");
  });

  it("creates persistent sharing-card settings with a generation status", () => {
    const workspace = createDefaultBeautyWorkspace("ru");
    expect(workspace.shareCard.enabled).toBe(true);
    expect(workspace.shareCard.serviceIds).toEqual([workspace.service.id]);
    expect(workspace.shareCard.status).toBe("updating");
    expect(workspace.shareCard.generatedImageDataUrl).toBe("");
  });

  it("publishes only completed optional blocks and active services", () => {
    let workspace = createDefaultBeautyWorkspace("en");
    workspace.profile.experienceByLanguage.en = "8 years";
    workspace.profile.materialsByLanguage = emptyBeautyLocalizedText();
    workspace.profile.instagramUrl = "https://instagram.com/studio";
    const second = createBeautyService("en", 1, "second");
    second.nameByLanguage.en = "Nail repair";
    second.name = "Nail repair";
    second.priceCzk = 290;
    const inactive = createBeautyService("en", 2, "inactive");
    inactive.active = false;
    workspace = withBeautyServices(workspace, [workspace.service, second, inactive]);
    const work = createBeautyPortfolioItem(0, "work-1");
    work.imageUrl = "https://images.example/work.jpg";
    work.altByLanguage.en = "Gel manicure";
    workspace.portfolio = [work];

    const publicProfile = buildBeautyPublicProfile(workspace, "en");
    expect(publicProfile.experience).toBe("8 years");
    expect(publicProfile.materials).toBe("");
    expect(publicProfile.services.map((item) => item.name)).toEqual(["Gel manicure", "Nail repair"]);
    expect(publicProfile.portfolio).toEqual([{ id: "work-1", imageUrl: "https://images.example/work.jpg", alt: "Gel manicure" }]);
  });

  it("uses the first active service specialization to select the professional interface", () => {
    let workspace = createDefaultBeautyWorkspace("ru");
    const barber = createBeautyService("ru", 1, "barber-service");
    barber.specialization = "barber";
    workspace.services[0].active = false;
    workspace = withBeautyServices(workspace, [workspace.services[0], barber]);
    expect(primaryBeautySpecialization(workspace)).toBe("barber");
    expect(buildBeautyPublicProfile(workspace, "ru").services[0].specialization).toBe("barber");
  });

  it("requires at least one valid active service", () => {
    const workspace = createDefaultBeautyWorkspace();
    workspace.services[0].active = false;
    workspace.service.active = false;
    expect(validateBeautyStep(workspace, "pro_setup_service")).toContain("service_name_required");

    workspace.services[0].active = true;
    workspace.services[0].durationMinutes = 0;
    expect(validateBeautyStep(workspace, "pro_setup_service")).toContain("service_duration_invalid");
  });

  it("returns language-neutral validation codes", () => {
    const workspace = createDefaultBeautyWorkspace();
    workspace.profile.displayName = "";
    workspace.services[0].durationMinutes = 0;
    workspace.availability.weekdays = [];

    expect(validateBeautyStep(workspace, "pro_setup_profile")).toContain("profile_display_name_required");
    expect(validateBeautyStep(workspace, "pro_setup_service")).toContain("service_duration_invalid");
    expect(validateBeautyStep(workspace, "pro_setup_availability")).toContain("availability_weekday_required");
  });

  it("requires a recurring break to stay inside working hours", () => {
    const workspace = createDefaultBeautyWorkspace();
    workspace.availability.breakStart = "08:30";

    expect(validateBeautyStep(workspace, "pro_setup_availability"))
      .toContain("availability_break_outside_working_hours");
  });
});
