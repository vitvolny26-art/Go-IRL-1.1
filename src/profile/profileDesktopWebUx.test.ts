import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const interestsSource = readFileSync(
  new URL("../components/ProfileInterestsGoalsSection.tsx", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(new URL("../components/ProfilePanel.tsx", import.meta.url), "utf8");
const projectionsSource = readFileSync(
  new URL("../components/ProfileDesktopVerticalProjections.tsx", import.meta.url),
  "utf8",
);
const profileHubCss = readFileSync(new URL("../profile-hub.css", import.meta.url), "utf8");
const roadmapCss = readFileSync(new URL("../profile-roadmap-004-009.css", import.meta.url), "utf8");

describe("UProfile016 desktop web profile UX", () => {
  it("keeps Interests and goals collapsed until the user expands it", () => {
    expect(interestsSource).toContain('<details className="profile-interests-goals">');
    expect(interestsSource).toContain('<summary aria-labelledby="profile-interests-title">');
    expect(interestsSource).not.toContain('<details className="profile-interests-goals" open');
    expect(roadmapCss).toContain(".profile-interests-goals[open]>summary::after");
  });

  it("opens profile editing as a desktop-web dialog without changing compact clients", () => {
    expect(profileHubCss).toContain('@media (min-width: 960px)');
    expect(profileHubCss).toContain('html[data-go-irl-client="web"] .profile-page.is-editing .profile-edit-form');
    expect(profileHubCss).toContain("position: fixed;");
    expect(profileHubCss).toContain("width: min(900px, calc(100vw - 64px));");
    expect(appSource).toContain('className="profile-edit-close"');
  });

  it("keeps the owned profile summary pinned on desktop web without the Beauty banner", () => {
    expect(panelSource).toContain('className="profile-panel-pinned-identity"');
    expect(panelSource).not.toContain('className="profile-panel-beauty-entry"');
    expect(profileHubCss).toContain('.profile-panel[data-profile-panel-section] .profile-panel-pinned-identity');
    expect(profileHubCss).toContain("position: sticky;");
  });

  it("lets desktop users edit Services preferences from the projection card", () => {
    expect(projectionsSource).toContain("servicePreferenceIds.map");
    expect(projectionsSource).toContain("writeProfileVerticalPreferences");
    expect(projectionsSource).toContain("aria-pressed={selected}");
    expect(profileHubCss).toContain(".profile-projection-editor");
  });
});
