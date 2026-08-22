import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import portalSource from "./BeautyProfessionalProfilePortal.tsx?raw";

const overridesSource = readFileSync(new URL("./beauty-professional-profile-overrides.css", import.meta.url), "utf8");

describe("profession-aware Beauty public profile theme", () => {
  it("resolves public artwork from profession before the legacy service-name fallback", () => {
    expect(portalSource).toContain("resolveServiceArtwork(professional.profession, professional.serviceName)");
    expect(portalSource).toContain("artwork === barberArtwork");
    expect(portalSource).toContain("beauty-pro-profile-shell--${profileProfession}");
    expect(portalSource).toContain("beauty-pro-profile-backdrop--${profileProfession}");
  });

  it("gives barber profiles their own background, icon and navy theme", () => {
    expect(overridesSource).toContain(".beauty-pro-profile-shell--barber");
    expect(overridesSource).toContain(".beauty-pro-profile-backdrop--barber");
    expect(overridesSource).toContain("url('/services/sheets-9x16/s-02-barber.webp')");
    expect(overridesSource).toContain("url('/services/icons/s-02-barber.webp')");
    expect(overridesSource).toContain("--beauty-barber-navy:#07182b");
    expect(overridesSource).toContain("--beauty-barber-silver:#c7d0da");
  });
});
