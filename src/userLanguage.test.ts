import { describe, expect, it } from "vitest";
import { contentLanguageForUserLanguage, parseUserLanguage, resolveUserLanguage } from "./userLanguage";

describe("canonical user language", () => {
  it.each(["ru", "uk", "cs", "en", "pl", "sk"])("accepts supported language %s", (language) => {
    expect(parseUserLanguage(language)).toBe(language);
  });

  it("normalizes regional codes and falls back to English when unsupported", () => {
    expect(parseUserLanguage("pl-PL")).toBe("pl");
    expect(parseUserLanguage("sk_SK")).toBe("sk");
    expect(resolveUserLanguage("fr-FR")).toBe("en");
    expect(resolveUserLanguage(null)).toBe("en");
  });

  it("maps UI-only languages only at four-language content boundaries", () => {
    expect(contentLanguageForUserLanguage("pl")).toBe("en");
    expect(contentLanguageForUserLanguage("sk")).toBe("cs");
    expect(contentLanguageForUserLanguage("uk")).toBe("uk");
  });
});
