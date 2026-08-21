import { describe, expect, it } from "vitest";
import {
  legacyServicesClientProfileStorageKey,
  profileVerticalPreferencesStorageKey,
  readProfileVerticalPreferences,
  readServicesClientPreferences,
  writeServicesClientPreferences,
  type ProfilePreferenceStorage,
} from "./profileVerticalPreferences";

const memoryStorage = () => {
  const values = new Map<string, string>();
  const storage: ProfilePreferenceStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
  return { storage, values };
};

describe("profile vertical preferences", () => {
  it("reads canonical values and filters unsupported entries", () => {
    const { storage } = memoryStorage();
    storage.setItem(profileVerticalPreferencesStorageKey, JSON.stringify({
      services: ["manicure", "unsupported", "massage", "manicure"],
    }));

    expect(readProfileVerticalPreferences(storage)).toEqual({ services: ["manicure", "massage"] });
    expect(readServicesClientPreferences(storage)).toEqual(["Маникюр", "Массаж"]);
  });

  it("migrates legacy Services preferences without deleting the legacy record", () => {
    const { storage } = memoryStorage();
    const legacy = JSON.stringify({ name: "Anna", preferences: ["Маникюр", "Массаж", "unsupported"] });
    storage.setItem(legacyServicesClientProfileStorageKey, legacy);

    expect(readProfileVerticalPreferences(storage)).toEqual({ services: ["manicure", "massage"] });
    expect(storage.getItem(profileVerticalPreferencesStorageKey)).toBe(JSON.stringify({ services: ["manicure", "massage"] }));
    expect(storage.getItem(legacyServicesClientProfileStorageKey)).toBe(legacy);
  });

  it("prefers canonical state when both canonical and legacy records exist", () => {
    const { storage } = memoryStorage();
    storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify({ preferences: ["Массаж"] }));
    storage.setItem(profileVerticalPreferencesStorageKey, JSON.stringify({ services: ["hair"] }));

    expect(readProfileVerticalPreferences(storage)).toEqual({ services: ["hair"] });
    expect(readServicesClientPreferences(storage)).toEqual(["Волосы"]);
  });

  it("writes Services values through the canonical UProfile preference state", () => {
    const { storage } = memoryStorage();

    writeServicesClientPreferences(storage, ["Волосы", "facial", "unsupported"]);

    expect(readProfileVerticalPreferences(storage)).toEqual({ services: ["hair", "facial"] });
    expect(storage.getItem(profileVerticalPreferencesStorageKey)).toBe(JSON.stringify({ services: ["hair", "facial"] }));
  });
});
