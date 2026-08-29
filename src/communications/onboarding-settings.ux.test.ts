import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const claimPage = readFileSync(new URL("../beauty/BeautyMasterClaimPage.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../beauty/BeautyWorkspaceSettingsDialog.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
const authSession = readFileSync(new URL("../authSession.ts", import.meta.url), "utf8");
const firstOnboarding = readFileSync(new URL("../onboarding/firstOnboarding.ts", import.meta.url), "utf8");
const firstOnboardingGate = readFileSync(new URL("../onboarding/FirstOnboardingGate.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("./CommunicationPreferencePanel.tsx", import.meta.url), "utf8");
const userGate = readFileSync(new URL("./UserCommunicationPreferenceGate.tsx", import.meta.url), "utf8");
const feature = readFileSync(new URL("./feature.ts", import.meta.url), "utf8");

describe("GROOMING018 post-claim communication UX", () => {
  it("requires a route selection after claim and before opening the draft workspace", () => {
    expect(claimPage).toContain('setState("communication")');
    expect(claimPage).toContain("<CommunicationPreferencePanel language={language} required");
    expect(claimPage.indexOf('setState("communication")')).toBeLessThan(claimPage.indexOf('window.location.replace("/beauty/workspace")'));
  });
  it("edits the same preference in workspace Settings", () => {
    expect(settings).toContain("<CommunicationPreferencePanel language={language} />");
    expect(panel).toContain("loadCommunicationSettings");
    expect(panel).toContain("saveCommunicationPreference(selected)");
  });
  it("keeps the master wording while giving ordinary users reminder/notification/communication wording", () => {
    expect(panel).toContain('title: "Как с вами связываться?"');
    expect(panel).toContain('title: "Укажите канал для напоминаний, уведомлений и коммуникаций"');
    expect(userGate).toContain('identity.user.role !== "user"');
    expect(userGate).toContain('settings.preference.state === "unconfigured"');
    expect(userGate).toContain('audience="user"');
  });
  it("shows the ordinary-user gate globally only after first onboarding can complete", () => {
    expect(main).toContain("<UserCommunicationPreferenceGate />");
    expect(userGate).toContain("loadFirstOnboardingState");
    expect(userGate).toContain("if (!onboarding.completed)");
    expect(firstOnboarding).toContain('firstOnboardingCompletedEvent = "go-irl:first-onboarding-completed"');
    expect(firstOnboarding).toContain("window.dispatchEvent(new Event(firstOnboardingCompletedEvent))");
  });
  it("rechecks onboarding and communication prompts when trusted auth becomes available after mount", () => {
    expect(authSession).toContain('trustedAuthSessionChangedEvent = "go-irl:trusted-auth-session-changed"');
    expect(authSession).toContain("window.dispatchEvent(new Event(trustedAuthSessionChangedEvent))");
    expect(firstOnboardingGate).toContain("window.addEventListener(trustedAuthSessionChangedEvent, refreshAfterAuth)");
    expect(firstOnboardingGate).toContain("window.removeEventListener(trustedAuthSessionChangedEvent, refreshAfterAuth)");
    expect(userGate).toContain("window.addEventListener(trustedAuthSessionChangedEvent, refreshAfterAuth)");
    expect(userGate).toContain("window.removeEventListener(trustedAuthSessionChangedEvent, refreshAfterAuth)");
  });
  it("keeps production behavior unchanged until the protected migration/config gate is opened", () => {
    expect(feature).toContain('VITE_GO_IRL_COMMUNICATION_ROUTER === "true"');
    expect(claimPage).toContain("if (communicationRouterEnabled)");
    expect(settings).toContain("communicationRouterEnabled ?");
  });
  it("does not present candidate identities as message-ready", () => {
    expect(panel).toContain('route.readiness !== "ready"');
    expect(panel).toContain('route.consent !== "granted"');
    expect(panel).toContain('route.capabilities.includes("outbound")');
    expect(panel).toContain('route.capabilities.includes("notification")');
  });
});
