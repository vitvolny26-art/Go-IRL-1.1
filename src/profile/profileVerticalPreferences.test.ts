import { describe, expect, it } from "vitest";
import {
  legacyServicesClientProfileStorageKey,
  profileVerticalPreferencesStorageKey,
  profileVerticalPreferencesStorageKeyForUser,
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
    removeItem: (key) => { values.delete(key); },
  };
  return { storage, values };
};

describe("profile vertical preferences", () => {
  it("reads account-scoped canonical values and filters unsupported entries", () => {
    const { storage } = memoryStorage();
    const userKey = "user:a";
    storage.setItem(profileVerticalPreferencesStorageKeyForUser(userKey), JSON.stringify({
      services: ["manicure", "unsupported", "massage", "manicure"],
    }));

    expect(readProfileVerticalPreferences(storage, userKey)).toEqual({ services: ["manicure", "massage"] });
    expect(readServicesClientPreferences(storage, userKey)).toEqual(["Маникюр", "Массаж"]);
  });

  it("migrates legacy Services preferences once without exposing them to another account", () => {
    const { storage } = memoryStorage();
    const legacy = JSON.stringify({ name: "Anna", preferences: ["Маникюр", "Массаж", "unsupported"] });
    storage.setItem(legacyServicesClientProfileStorageKey, legacy);

    expect(readProfileVerticalPreferences(storage, "user:a")).toEqual({ services: ["manicure", "massage"] });
    expect(storage.getItem(profileVerticalPreferencesStorageKeyForUser("user:a"))).toBe(JSON.stringify({ services: ["manicure", "massage"] }));
    expect(storage.getItem(legacyServicesClientProfileStorageKey)).toBe(JSON.stringify({ name: "Anna" }));
    expect(readProfileVerticalPreferences(storage, "user:b")).toEqual({ services: [] });
  });

  it("claims the previous unscoped canonical record for one account only", () => {
    const { storage } = memoryStorage();
    storage.setItem(profileVerticalPreferencesStorageKey, JSON.stringify({ services: ["hair"] }));

    expect(readProfileVerticalPreferences(storage, "user:a")).toEqual({ services: ["hair"] });
    expect(storage.getItem(profileVerticalPreferencesStorageKey)).toBeNull();
    expect(readProfileVerticalPreferences(storage, "user:b")).toEqual({ services: [] });
  });

  it("does not claim a legacy Services name-only record as preference state", () => {
    const { storage } = memoryStorage();
    storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify({ name: "Anna" }));

    expect(readProfileVerticalPreferences(storage, "user:a")).toEqual({ services: [] });

    storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify({
      name: "Anna",
      preferences: ["massage"],
    }));
    expect(readProfileVerticalPreferences(storage, "user:b")).toEqual({ services: ["massage"] });
  });

  it("cleans compatibility preference payloads for an account migrated before cleanup", () => {
    const { storage } = memoryStorage();
    const userKey = "user:a";
    storage.setItem(profileVerticalPreferencesStorageKeyForUser(userKey), JSON.stringify({ services: ["hair"] }));
    storage.setItem(profileVerticalPreferencesStorageKey, JSON.stringify({ services: ["massage"] }));
    storage.setItem(`${profileVerticalPreferencesStorageKey}:legacy-owner`, userKey);
    storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify({
      name: "Anna",
      preferences: ["massage"],
    }));

    expect(readProfileVerticalPreferences(storage, userKey)).toEqual({ services: ["hair"] });
    expect(storage.getItem(profileVerticalPreferencesStorageKey)).toBeNull();
    expect(storage.getItem(legacyServicesClientProfileStorageKey)).toBe(JSON.stringify({ name: "Anna" }));
  });

  it("keeps user A preferences isolated when switching to user B", () => {
    const { storage } = memoryStorage();

    writeServicesClientPreferences(storage, "user:a", ["Волосы", "facial"]);

    expect(readProfileVerticalPreferences(storage, "user:a")).toEqual({ services: ["hair", "facial"] });
    expect(readProfileVerticalPreferences(storage, "user:b")).toEqual({ services: [] });
  });

  it("stores only language-neutral stable IDs in the account-scoped canonical record", () => {
    const { storage } = memoryStorage();
    const userKey = "telegram:42";

    writeServicesClientPreferences(storage, userKey, ["Волосы", "Уход за лицом", "unsupported"]);

    const stored = storage.getItem(profileVerticalPreferencesStorageKeyForUser(userKey));
    expect(stored).toBe(JSON.stringify({ services: ["hair", "facial"] }));
    expect(stored).not.toContain("Волосы");
    expect(stored).not.toContain("Уход");
  });

  it("does not claim legacy global state for an unauthenticated placeholder", () => {
    const { storage } = memoryStorage();
    storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify({ preferences: ["Массаж"] }));

    expect(readProfileVerticalPreferences(storage, "unauthenticated")).toEqual({ services: [] });
    expect(readProfileVerticalPreferences(storage, "user:a")).toEqual({ services: ["massage"] });
  });
});
