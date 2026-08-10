import { describe, expect, it } from "vitest";
import {
  isFirstOnboardingComplete,
  normalizeFirstOnboardingNickname,
  parseFirstOnboardingState,
  validateFirstOnboardingNickname,
} from "./firstOnboarding";

describe("first onboarding policy", () => {
  it("normalizes nickname exactly like the activation contract", () => {
    expect(normalizeFirstOnboardingNickname("  Vit_User  ")).toBe("vit_user");
  });

  it("rejects malformed and reserved nicknames before the RPC", () => {
    expect(validateFirstOnboardingNickname("ab")).toBe("invalid_nickname");
    expect(validateFirstOnboardingNickname("vit__user")).toBe("invalid_nickname");
    expect(validateFirstOnboardingNickname("admin_team")).toBe("reserved_nickname");
    expect(validateFirstOnboardingNickname("vit_user")).toBeNull();
  });

  it("fails closed unless the server reports completed true", () => {
    expect(isFirstOnboardingComplete(parseFirstOnboardingState({ completed: false }))).toBe(false);
    expect(isFirstOnboardingComplete(parseFirstOnboardingState({ completed: true, nickname: "vit_user" }))).toBe(true);
  });
});
