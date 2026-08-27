import { describe, expect, it } from "vitest";
import { activityOptions, categories, closedBetaActivityOptions, closedBetaCategories } from "./data";
import { contentLanguageForUi, languageOptions } from "./i18n";

describe("activity taxonomy", () => {
  it("has unique category ids", () => {
    const ids = categories.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has localized labels and activity options for every UI language through content fallback", () => {
    for (const category of categories) {
      expect(category.icon).toBeTruthy();
      for (const language of languageOptions) expect(category.name[contentLanguageForUi(language.id)]).toBeTruthy();
      expect(activityOptions[category.id]?.length).toBeGreaterThan(0);
      for (const option of activityOptions[category.id]) {
        for (const language of languageOptions) expect(option.name[contentLanguageForUi(language.id)]).toBeTruthy();
      }
    }
  });

  it("keeps inline skating inside the Activities category", () => {
    expect(categories.some((category) => category.id === "inline-skating")).toBe(false);
    expect(activityOptions.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({ icon: "🛼" }),
    ]));
  });

  it("offers localized chess inside the Activities category", () => {
    expect(activityOptions.activities).toContainEqual({
      icon: "♟️",
      name: { ru: "Шахматы", uk: "Шахи", cs: "Šachy", en: "Chess" },
    });
  });

  it("keeps Gym fifth in the Sport activity order", () => {
    expect(activityOptions.sport[4]?.name.en).toBe("Gym");
  });

  it("uses the direct beer invitation copy", () => {
    expect(activityOptions.party[0]?.name).toEqual({
      ru: "Идём на пиво",
      uk: "Йдемо на пиво",
      cs: "Jdeme na pivo",
      en: "Let's get a beer",
    });
  });

  it("limits closed beta create taxonomy to canonical beta options", () => {
    expect(closedBetaCategories.map((category) => category.id)).toEqual(["sport", "activities", "social"]);
    expect(closedBetaActivityOptions.sport.map((option) => option.name.en)).toEqual(["Volleyball", "Running"]);
    expect(closedBetaActivityOptions.activities.map((option) => option.name.en)).toEqual(["Coffee", "Board games", "Chess"]);
    expect(closedBetaActivityOptions.social.map((option) => option.name.en)).toEqual(["Walk", "Language exchange"]);
  });
});
