import { describe, expect, it } from "vitest";
import {
  defaultProfilePanelSection,
  profilePanelSections,
  resolveProfilePanelBackTarget,
  resolveProfilePanelSection,
  transitionProfilePanel,
} from "./profilePanelNavigation";

describe("profile panel navigation", () => {
  it("exposes the implemented owner sections", () => {
    expect(profilePanelSections.map((section) => section.id)).toEqual([
      "identity",
      "preferences",
      "my-go-irl",
      "privacy",
      "security",
      "diagnostics",
    ]);
    expect(profilePanelSections.every((section) => section.ownerOnly)).toBe(true);
  });

  it("falls back deterministically for an unknown section", () => {
    expect(resolveProfilePanelSection("unknown")).toBe(defaultProfilePanelSection);
    expect(resolveProfilePanelSection(null)).toBe(defaultProfilePanelSection);
  });

  it("keeps identity active while profile editing is in progress", () => {
    const state = { activeSection: "identity" as const, editing: true };
    expect(transitionProfilePanel(state, "privacy")).toEqual(state);
  });

  it("allows navigation after editing ends", () => {
    expect(transitionProfilePanel(
      { activeSection: "identity", editing: false },
      "my-go-irl",
    )).toEqual({ activeSection: "my-go-irl", editing: false });
  });

  it("returns to identity before leaving the profile view", () => {
    expect(resolveProfilePanelBackTarget("privacy")).toBe("identity");
    expect(resolveProfilePanelBackTarget("identity")).toBeNull();
  });
});
