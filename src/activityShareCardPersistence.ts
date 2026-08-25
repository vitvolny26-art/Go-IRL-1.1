import { getTrustedAccessToken } from "./authSession";
import { useAppStore } from "./store";
import { syncJoinedParticipantTelegramAccess } from "./telegramEventSupergroup";

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
  const joinActivity = state.joinActivity;
  const reviewRequest = state.reviewRequest;
  useAppStore.setState({
    createActivity: async (input) => {
      const id = await createActivity(input);
      void persistActivityShareCards(id);
      return id;
    },
    updateActivity: async (id, input) => {
      const result = await updateActivity(id, input);
      void persistActivityShareCards(result);
      return result;
    },
    joinActivity: async (id) => {
      const result = await joinActivity(id);
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
