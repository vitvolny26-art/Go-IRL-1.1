import { getTrustedAccessToken } from "./authSession";
import { useAppStore } from "./store";

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

export function enableActivityShareCardPersistence() {
  const state = useAppStore.getState();
  const createActivity = state.createActivity;
  const updateActivity = state.updateActivity;
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
  });
}

enableActivityShareCardPersistence();
