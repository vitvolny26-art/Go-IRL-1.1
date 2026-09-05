/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const main = source("./main.tsx");
const header = source("./components/AppHeader.tsx");
const preferences = source("./userPreferences.ts");
const telegramAuth = source("../supabase/functions/verifyTelegramInitData/index.ts");
const communicationVerification = source("../supabase/functions/telegramEventSupergroup/communicationVerification.ts");

describe("canonical user-language runtime contract", () => {
  it("keeps six-language UI state separate from four-language content state on first launch", () => {
    expect(main).toContain('const uiLanguageStorageKey = "go-irl-ui-language"');
    expect(main).toContain('preferences.languageSource === "explicit" || preferences.languageSource === "server"');
    expect(main).toContain('preferences.languageSource || (storedUiLanguage ? "explicit" : "inferred")');
    expect(main).toContain("const language = storedLanguage || telegramLanguage || browserLanguage || \"en\"");
    expect(main).toContain("localStorage.setItem(uiLanguageStorageKey, language)");
    expect(main).toContain("localStorage.setItem(legacyLanguageStorageKey, contentLanguageForUserLanguage(language))");
    expect(main).toContain("useAppStore.setState({ language: contentLanguageForUserLanguage(language) })");
  });

  it("persists an explicit header choice as the exact canonical user language", () => {
    expect(header).toContain('updateUserPreferences({ language: nextLanguage, languageSource: "explicit" })');
    expect(preferences).toContain('languageSource === "explicit"');
    expect(preferences).toContain("persistCanonicalLanguage(preferences.language)");
  });

  it("reconciles a supported server language when no local explicit choice exists", () => {
    expect(preferences).toContain('select("language_code")');
    expect(preferences).toContain("const serverLanguage = parseUserLanguage(data?.language_code)");
    expect(preferences).toContain('applyCanonicalLanguageLocally(serverLanguage, "server")');
  });

  it("does not overwrite a supported server language during Telegram login", () => {
    const readExisting = telegramAuth.indexOf('select("language_code")');
    const writeUser = telegramAuth.indexOf('const upsertResult = await supabase.from("app_users").upsert');
    expect(readExisting).toBeGreaterThan(-1);
    expect(writeUser).toBeGreaterThan(readExisting);
    expect(telegramAuth).toContain("canonicalUserLanguage(existingUserResult.data?.language_code)");
    expect(telegramAuth).toContain('|| "en"');
  });

  it("uses stored language before callback language and falls back to English", () => {
    expect(communicationVerification).toContain('if (normalized.startsWith("ru")) return "ru"');
    expect(communicationVerification).toContain("const language = (value: string | null | undefined) => parsedLanguage(value) || \"en\"");
    expect(communicationVerification).toContain("const callbackLanguage = language(callbackQuery.from?.language_code)");
    expect(communicationVerification).toContain("copy[storedLanguage || callbackLanguage]");
    expect(communicationVerification).not.toContain("copy.ru.failed");
  });
});
