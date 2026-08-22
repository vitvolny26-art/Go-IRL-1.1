import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDefaultBeautyWorkspace } from "./beautySetupModel";
import { applyBeautyProfession } from "./beautyProfessionRegistry";

const indexSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const residualCss = readFileSync(new URL("./beauty-barber-residual-ui.css", import.meta.url), "utf8");

describe("Barber residual Nails cleanup", () => {
  it("replaces untouched Nails default profile copy when the profession changes to Barber", () => {
    const nails = createDefaultBeautyWorkspace("en");
    const barber = applyBeautyProfession(nails, "barber");

    expect(barber.profile.descriptionByLanguage.en).toBe("Barber cuts and grooming with convenient appointment times.");
    expect(barber.profile.description).toBe("Barber cuts and grooming with convenient appointment times.");
  });

  it("preserves user-authored profile copy during the profession change", () => {
    const nails = createDefaultBeautyWorkspace("en");
    const custom = {
      ...nails,
      profile: {
        ...nails.profile,
        description: "Custom barber bio",
        descriptionByLanguage: { ...nails.profile.descriptionByLanguage, en: "Custom barber bio" },
      },
    };
    const barber = applyBeautyProfession(custom, "barber");

    expect(barber.profile.descriptionByLanguage.en).toBe("Custom barber bio");
    expect(barber.profile.description).toBe("Custom barber bio");
  });

  it("loads Barber-only residual UI overrides without changing Nails defaults", () => {
    expect(indexSource).toContain('/src/beauty/beauty-barber-residual-ui.css');
    expect(residualCss).toContain('body:has(.beauty-workspace-shell[data-service-specialization="barber"]) .beauty-workspace-settings-dialog');
    expect(residualCss).toContain('body:has(.beauty-pro-profile-shell--barber) .service-booking-sheet');
    expect(residualCss).toContain('.beauty-pro-profile-about .beauty-pro-profile-heading > svg');
    expect(residualCss).not.toContain('body:has(.beauty-pro-profile-shell--nails)');
  });
});
