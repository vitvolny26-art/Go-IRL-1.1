import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compactSportCardFinalCss = readFileSync(new URL("./compact-sport-card-final.css", import.meta.url), "utf8");
const allEventCardTemplateCss = readFileSync(new URL("./all-event-card-template.css", import.meta.url), "utf8");
const coachFeatureSource = readFileSync(new URL("./coachFeature.ts", import.meta.url), "utf8");
const telegramSource = readFileSync(new URL("./telegram.ts", import.meta.url), "utf8");

describe("WEB001-R3 desktop Activities width", () => {
  it("fills the 480px desktop For You grid track while preserving the legacy mobile width", () => {
    expect(compactSportCardFinalCss).toContain(`@media (min-width: 960px) {\n  html[data-go-irl-client="web"] .discover-page .horizontal-events > .compact-sport-card {\n    width: 100% !important;\n    min-width: 0 !important;\n    flex: none !important;`);
    expect(allEventCardTemplateCss).toContain(`.horizontal-events > .compact-sport-card {\n  flex: 0 0 min(92vw, 420px) !important;\n  width: min(92vw, 420px) !important;`);
  });
});

describe("WEB001-R3 guest coach requests", () => {
  it("returns before querying coach_requests when trusted auth is unavailable", () => {
    const guardIndex = coachFeatureSource.indexOf("if (!isTrustedAuthReady())");
    const queryIndex = coachFeatureSource.indexOf('.from("coach_requests")');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(queryIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(queryIndex);
  });
});

describe("WEB001-R3 Telegram BackButton version gate", () => {
  it("uses BackButton only when Telegram reports version 6.1 or newer", () => {
    expect(telegramSource).toContain('webApp.isVersionAtLeast?.("6.1") !== true');
    expect(telegramSource).toContain("const backButton = getSupportedBackButton();");
    expect(telegramSource).toContain("export const hideBackButton = () => getSupportedBackButton()?.hide();");
  });
});
