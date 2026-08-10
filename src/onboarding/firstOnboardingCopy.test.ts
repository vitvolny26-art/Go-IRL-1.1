import { describe, expect, it } from "vitest";
import { getFirstOnboardingCopy } from "./firstOnboardingCopy";

const languages = ["ru", "uk", "cs", "en"] as const;

describe("first onboarding copy", () => {
  it("provides complete localized copy for every supported language", () => {
    for (const language of languages) {
      const copy = getFirstOnboardingCopy(language);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.continue.length).toBeGreaterThan(0);
      expect(copy.saveError.length).toBeGreaterThan(0);
    }
  });

  it("uses Russian copy when the app language is Russian", () => {
    const copy = getFirstOnboardingCopy("ru");
    expect(copy.title).toBe("Завершите профиль");
    expect(copy.continue).toBe("Продолжить");
    expect(copy.backToEvent).toBe("Назад к событию");
  });
});