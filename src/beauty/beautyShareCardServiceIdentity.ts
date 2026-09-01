const beautyServiceDatabaseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BeautyServerServiceIdentity = {
  id?: unknown;
  database_id?: unknown;
};

export const isBeautyShareCardDatabaseServiceId = (value: string) =>
  beautyServiceDatabaseIdPattern.test(value.trim());

export const buildBeautyShareCardServiceIdentityMap = (value: unknown) => {
  const clientToDatabase = new Map<string, string>();
  const databaseToClient = new Map<string, string>();
  if (!Array.isArray(value)) return { clientToDatabase, databaseToClient };

  for (const item of value) {
    const service = item as BeautyServerServiceIdentity;
    const clientKey = typeof service.id === "string" ? service.id.trim() : "";
    const databaseId = typeof service.database_id === "string" ? service.database_id.trim() : "";
    if (!clientKey || !isBeautyShareCardDatabaseServiceId(databaseId)) continue;
    clientToDatabase.set(clientKey, databaseId);
    databaseToClient.set(databaseId, clientKey);
  }

  return { clientToDatabase, databaseToClient };
};

export const resolveBeautyShareCardServiceIdsForPersistence = (
  serviceIds: string[],
  serverServices: unknown,
) => {
  const { clientToDatabase } = buildBeautyShareCardServiceIdentityMap(serverServices);
  const resolved = serviceIds.slice(0, 3).map((serviceId) => {
    const normalized = serviceId.trim();
    const databaseId = clientToDatabase.get(normalized);
    if (databaseId) return databaseId;
    if (isBeautyShareCardDatabaseServiceId(normalized)) return normalized;
    throw new Error("beauty_share_card_service_id_missing");
  });
  return Array.from(new Set(resolved));
};

export const restoreBeautyShareCardServiceIdsFromPersistence = (
  serviceIds: string[],
  serverServices: unknown,
) => {
  const { databaseToClient } = buildBeautyShareCardServiceIdentityMap(serverServices);
  return serviceIds.slice(0, 3).map((serviceId) => databaseToClient.get(serviceId) || serviceId);
};
