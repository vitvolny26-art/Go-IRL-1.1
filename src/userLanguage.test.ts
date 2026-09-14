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

  it("keeps every supported user language as a canonical content language", () => {
    expect(contentLanguageForUserLanguage("pl")).toBe("pl");
    expect(contentLanguageForUserLanguage("sk")).toBe("sk");
    expect(contentLanguageForUserLanguage("uk")).toBe("uk");
  });
});
