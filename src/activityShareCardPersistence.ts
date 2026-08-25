import { getTrustedAccessToken } from "./authSession";
import { useAppStore } from "./store";
import type { ActivityMetadata } from "./types";
import { syncJoinedParticipantTelegramAccess, unpinCityActivity } from "./telegramEventSupergroup";

export const activityShareCardPersistenceEndpoint = "https://go-irl-1-1.vercel.app/api/share/persist-event-cards";

export async function persistActivityShareCards(eventId: string) {
  const accessToken = await getTrustedAccessToken();
  if (!accessToken) return false;
  try {
    const response = await fetch(activityShareCardPersistenceEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const preserveCityTelegramPublicationMetadata = (
  currentMetadata: ActivityMetadata | undefined,
  nextMetadata: ActivityMetadata | undefined,
): ActivityMetadata | undefined => {
  const current = currentMetadata as unknown as Record<string, unknown> | undefined;
  if (!current || !Object.prototype.hasOwnProperty.call(current, "cityTelegramPublication")) return nextMetadata;
  return {
    ...(nextMetadata || {}),
    cityTelegramPublication: current.cityTelegramPublication,
  } as ActivityMetadata;
};

const hasActiveCityTelegramPublication = (metadata: ActivityMetadata | undefined) => {
  const record = metadata as unknown as Record<string, unknown> | undefined;
  const publication = record?.cityTelegramPublication;
  return Boolean(publication && typeof publication === "object"
    && (publication as Record<string, unknown>).active === true);
};

const syncTelegramAccess = async (activityId: string, memberUserKey?: string) => {
  try {
    await syncJoinedParticipantTelegramAccess(activityId, memberUserKey);
  } catch (error) {
    console.warn("activity_telegram_access_sync_failed", error);
  }
};

export function enableActivityShareCardPersistence() {
  const state = useAppStore.getState();
  const createActivity = state.createActivity;
  const updateActivity = state.updateActivity;
  const deleteActivity = state.deleteActivity;
  const toggleJoin = state.toggleJoin;
  const reviewRequest = state.reviewRequest;
  useAppStore.setState({
    createActivity: async (input) => {
      const id = await createActivity(input);
      void persistActivityShareCards(id);
      return id;
    },
    updateActivity: async (id, input) => {
      const current = useAppStore.getState().activities.find((activity) => activity.id === id);
      const metadata = preserveCityTelegramPublicationMetadata(current?.metadata, input.metadata);
      const result = await updateActivity(id, { ...input, metadata });
      void persistActivityShareCards(result);
      return result;
    },
    deleteActivity: async (id) => {
      const current = useAppStore.getState().activities.find((activity) => activity.id === id);
      if (hasActiveCityTelegramPublication(current?.metadata)) await unpinCityActivity(id);
      const result = await deleteActivity(id);
      return result;
    },
    toggleJoin: async (id) => {
      const result = await toggleJoin(id);
      if (result === "joined") void syncTelegramAccess(id);
      return result;
    },
    reviewRequest: async (activityId, memberKey, approved) => {
      const result = await reviewRequest(activityId, memberKey, approved);
      if (approved) void syncTelegramAccess(activityId, memberKey);
      return result;
    },
  });
}

enableActivityShareCardPersistence();
