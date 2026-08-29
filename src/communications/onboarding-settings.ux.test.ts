import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const claimPage = readFileSync(new URL("../beauty/BeautyMasterClaimPage.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../beauty/BeautyWorkspaceSettingsDialog.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("./CommunicationPreferencePanel.tsx", import.meta.url), "utf8");
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
