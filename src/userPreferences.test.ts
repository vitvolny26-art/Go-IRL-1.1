import { beforeEach, describe, expect, it } from "vitest";
import {
  clearReminderProviderPreference,
  normalizeUserPreferences,
  readUserPreferences,
  updateUserPreferences,
  userPreferencesStorageKey,
} from "./userPreferences";

const values = new Map<string, string>();
const storage = {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
};

Object.defineProperty(globalThis, "localStorage", { value: storage });

beforeEach(() => {
  localStorage.clear();
});

describe("user provider preferences", () => {
  it("keeps share and reminder providers independent", () => {
    const saved = updateUserPreferences({
      shareProvider: "whatsapp",
      reminderProvider: "telegram",
    });

    expect(saved.shareProvider).toBe("whatsapp");
    expect(saved.reminderProvider).toBe("telegram");
    expect(readUserPreferences()).toMatchObject(saved);
  });

  it("normalizes invalid providers without inventing availability", () => {
    expect(normalizeUserPreferences({
      mapProvider: "invalid",
      calendarProvider: "google",
      shareProvider: "signal",
      reminderProvider: "instagram",
    })).toEqual({
      language: undefined,
      languageSource: undefined,
      cityId: undefined,
      mapProvider: undefined,
      calendarProvider: "google",
      shareProvider: undefined,
      reminderProvider: "instagram",
    });
  });

  it("preserves the explicit six-language UI choice across the four-language content boundary", () => {
    localStorage.setItem("go-irl-ui-language", "pl");
    const saved = updateUserPreferences({ language: "en" });
    expect(saved.language).toBe("pl");
    expect(saved.languageSource).toBe("explicit");
    expect(localStorage.getItem("go-irl-language")).toBe("en");
  });

  it("uses null as the explicit reset state", () => {
    updateUserPreferences({ reminderProvider: "telegram" });
    const reset = clearReminderProviderPreference();

    expect(reset.reminderProvider).toBeNull();
    expect(JSON.parse(localStorage.getItem(userPreferencesStorageKey) || "{}").reminderProvider).toBeNull();
  });
});
