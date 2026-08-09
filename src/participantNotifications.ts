import { getUserKey } from "./supabase";
import { useAppStore } from "./store";
import type { Activity } from "./types";
import {
  deriveParticipantJoinNotifications,
  type ParticipantJoinNotification,
} from "./participantNotificationLogic";

export type { ParticipantJoinNotification } from "./participantNotificationLogic";

const storageKeyPrefix = "go-irl-participant-notifications-v1";
export const participantNotificationsChangedEvent = "go-irl-participant-notifications-changed";
const maxNotifications = 40;

const currentStorageKey = () => {
  const userKey = getUserKey();
  if (!userKey || userKey === "unauthenticated") return null;
  return `${storageKeyPrefix}:${encodeURIComponent(userKey)}`;
};

export const getParticipantJoinNotifications = (): ParticipantJoinNotification[] => {
  if (typeof window === "undefined") return [];
  const storageKey = currentStorageKey();
  if (!storageKey) return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]") as ParticipantJoinNotification[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === "string" && typeof item.createdAt === "number")
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, maxNotifications);
  } catch {
    return [];
  }
};

const publishNotifications = (notifications: ParticipantJoinNotification[]) => {
  if (typeof window === "undefined") return;
  const storageKey = currentStorageKey();
  if (!storageKey) return;
  localStorage.setItem(storageKey, JSON.stringify(notifications.slice(0, maxNotifications)));
  window.dispatchEvent(new Event(participantNotificationsChangedEvent));
};

export const markParticipantJoinNotificationsRead = () => {
  const notifications = getParticipantJoinNotifications();
  if (!notifications.some((item) => !item.read)) return notifications;

  const next = notifications.map((item) => ({ ...item, read: true }));
  publishNotifications(next);
  return next;
};

const syncParticipantJoinNotifications = (activities: Activity[]) => {
  const currentUserKey = getUserKey();
  if (!currentUserKey || currentUserKey === "unauthenticated") return;

  const current = getParticipantJoinNotifications();
  const additions = deriveParticipantJoinNotifications(
    activities,
    currentUserKey,
    new Set(current.map((item) => item.id)),
  );

  if (!additions.length) return;
  publishNotifications([...additions, ...current]);
};

export const enableParticipantJoinNotifications = () => {
  if (typeof window === "undefined") return () => undefined;

  const sync = (state: ReturnType<typeof useAppStore.getState>) => {
    if (state.loading) return;
    syncParticipantJoinNotifications(state.activities);
  };

  const unsubscribe = useAppStore.subscribe(sync);
  sync(useAppStore.getState());
  return unsubscribe;
};
