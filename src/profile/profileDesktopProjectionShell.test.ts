import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../profile-hub.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../components/ProfileDesktopVerticalProjections.tsx", import.meta.url), "utf8");

describe("UProfile016 desktop vertical projection shell", () => {
  it("keeps the projection rail hidden by default for compact clients", () => {
    expect(css).toContain(`.profile-desktop-projections {\n  display: none;\n}`);
  });

  it("enables wide composition only for desktop web", () => {
    expect(css).toContain("@media (min-width: 960px)");
    expect(css).toContain('html[data-go-irl-client="web"] .profile-panel-shell');
    expect(css).toContain('html[data-go-irl-client="web"] .profile-desktop-projections');
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) minmax(280px, 0.42fr);");
  });

  it("renders bounded Activities and Services projections instead of another profile store", () => {
    expect(source).toContain('data-profile-projection="activities"');
    expect(source).toContain('data-profile-projection="services"');
    expect(source).toContain("buildMyGoIrlProjection");
    expect(source).toContain("useProfileVerticalPreferences");
    expect(source).not.toContain("localStorage.setItem");
    expect(source).not.toContain("saveOwnProfile");
  });
});
