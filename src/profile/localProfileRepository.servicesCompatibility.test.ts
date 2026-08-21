import { describe, expect, it } from "vitest";
import { LocalProfileRepository } from "./localProfileRepository";
import { legacyServicesClientProfileStorageKey } from "./profileVerticalPreferences";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const createRepository = (storage: Storage) => new LocalProfileRepository({
  storage,
  userKey: "guest:test",
  fallbackDisplayName: "Fallback user",
  fallbackCityId: "olomouc",
  now: () => new Date("2026-08-21T20:30:00.000Z"),
});

describe("LocalProfileRepository Services identity compatibility", () => {
  it("uses the legacy Services name only as a fallback when canonical local profile is absent", async () => {
    const storage = new MemoryStorage();
    storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify({ name: " Legacy service name " }));

    expect((await createRepository(storage).loadOwnProfile()).displayName).toBe("Legacy service name");
  });

  it("keeps canonical go-irl-profile identity authoritative when both records exist", async () => {
    const storage = new MemoryStorage();
    storage.setItem(legacyServicesClientProfileStorageKey, JSON.stringify({ name: "Legacy service name" }));
    storage.setItem("go-irl-profile", JSON.stringify({ name: "Canonical local name", cityId: "olomouc" }));

    expect((await createRepository(storage).loadOwnProfile()).displayName).toBe("Canonical local name");
  });
});
