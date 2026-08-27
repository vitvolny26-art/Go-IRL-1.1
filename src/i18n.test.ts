import { describe, expect, it } from "vitest";
import {
  contentLanguageForUi,
  getTranslation,
  languageOptions,
  localeByLanguage,
} from "./i18n";

describe("i18n", () => {
  it("defines all supported UI language options", () => {
    expect(languageOptions.map((option) => option.id)).toEqual(["ru", "uk", "cs", "en", "pl", "sk"]);
  });

  it("returns localized copy for every supported UI language", () => {
    for (const option of languageOptions) {
      const translation = getTranslation(option.id);
      expect(translation.create).toBeTruthy();
      expect(translation.join).toBeTruthy();
      expect(localeByLanguage[option.id]).toBeTruthy();
    }
  });

  it("keeps header labels localized", () => {
    expect(getTranslation("ru").selectCity).toContain("город");
    expect(getTranslation("uk").selectLanguage).toContain("мову");
    expect(getTranslation("cs").selectLanguage).toContain("jazyk");
    expect(getTranslation("en").selectCity).toContain("city");
    expect(getTranslation("pl").selectCity).toContain("miasto");
    expect(getTranslation("sk").selectLanguage).toContain("jazyk");
  });

  it("keeps legacy activity content on explicit fallback languages", () => {
    expect(contentLanguageForUi("pl")).toBe("en");
    expect(contentLanguageForUi("sk")).toBe("cs");
  });

  it("localizes destructive event actions", () => {
    expect(getTranslation("ru").deleteEventTitle).toBe("Удалить событие?");
    expect(getTranslation("uk").deleteEventWarning).toBe("Цю дію не можна скасувати");
    expect(getTranslation("cs").eventDeleted).toBe("Událost byla smazána");
    expect(getTranslation("en").delete).toBe("Delete");
    expect(getTranslation("pl").deleteEventTitle).toBe("Usunąć wydarzenie?");
    expect(getTranslation("sk").deleteEventTitle).toBe("Odstrániť udalosť?");
  });
});
