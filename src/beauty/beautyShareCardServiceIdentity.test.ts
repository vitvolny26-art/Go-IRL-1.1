import { describe, expect, it } from "vitest";
import repositorySource from "./beautyShareCardRepository.ts?raw";
import {
  isBeautyShareCardDatabaseServiceId,
  resolveBeautyShareCardServiceIdsForPersistence,
  restoreBeautyShareCardServiceIdsFromPersistence,
} from "./beautyShareCardServiceIdentity";

const serverServices = [
  {
    id: "local-service-primary",
    database_id: "11111111-1111-4111-8111-111111111111",
  },
  {
    id: "legacy-service",
    database_id: "22222222-2222-4222-8222-222222222222",
  },
];

describe("GROOMING021 Beauty share-card service identity", () => {
  it("maps workspace client keys to the database UUIDs required by save_my_beauty_share_card", () => {
    expect(resolveBeautyShareCardServiceIdsForPersistence(
      ["local-service-primary", "legacy-service"],
      serverServices,
    )).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("restores persisted database UUIDs to workspace client keys for editor selection", () => {
    expect(restoreBeautyShareCardServiceIdsFromPersistence([
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
    ], serverServices)).toEqual(["legacy-service", "local-service-primary"]);
  });

  it("preserves already-persisted UUIDs and rejects unresolved client keys", () => {
    const existingId = "33333333-3333-4333-8333-333333333333";
    expect(isBeautyShareCardDatabaseServiceId(existingId)).toBe(true);
    expect(resolveBeautyShareCardServiceIdsForPersistence([existingId], null)).toEqual([existingId]);
    expect(() => resolveBeautyShareCardServiceIdsForPersistence(["local-service-missing"], serverServices))
      .toThrow("beauty_share_card_service_id_missing");
  });

  it("resolves service IDs before uploads and sends only database IDs to the share-card RPC", () => {
    const resolveIndex = repositorySource.indexOf("const serviceIds = resolveBeautyShareCardServiceIdsForPersistence");
    const uploadIndex = repositorySource.indexOf("const [backgroundObjectPath, logoObjectPath]");
    expect(resolveIndex).toBeGreaterThanOrEqual(0);
    expect(resolveIndex).toBeLessThan(uploadIndex);
    expect(repositorySource).toContain('supabase.rpc("get_my_beauty_profile_v3")');
    expect(repositorySource).toContain("restoreBeautyShareCardServiceIdsFromPersistence(row.service_ids, serviceIdentitySource)");
    expect(repositorySource).toContain("p_service_ids: serviceIds");
    expect(repositorySource).not.toContain("p_service_ids: card.serviceIds.slice(0, 3)");
  });
});
