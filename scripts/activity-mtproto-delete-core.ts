import { resolveCityTelegramChatId, resolveCityTelegramUsername } from "../api/_shared/telegram-city-publication-core.ts";

export type CleanupActivity = {
  id: string; city_id: string; updated_at: string;
  metadata: Record<string, unknown>;
};

export function activityCleanupTarget(activity: CleanupActivity, activityId: string, messageId: number, now: number) {
  const state = activity.metadata.cityTelegramPublication as Record<string, unknown> | undefined;
  const chatId = resolveCityTelegramChatId(activity.city_id);
  const username = resolveCityTelegramUsername(activity.city_id);
  if (activity.id !== activityId || !state || state.activityId !== activityId
    || state.messageId !== messageId || !Number.isSafeInteger(messageId) || messageId <= 0
    || !chatId || !username || state.chatId !== chatId || state.deletedAt) {
    throw new Error("activity_cleanup_target_mismatch");
  }
  const endedAt = typeof state.unpinAt === "string" ? Date.parse(state.unpinAt) : NaN;
  if (!Number.isFinite(endedAt) || endedAt >= now) throw new Error("activity_cleanup_not_ended");
  return { chatId, username, state };
}

export async function deleteActivityPublication({ activity, activityId, messageId, now, readMessage, deleteMessage, reconcile }: {
  activity: CleanupActivity; activityId: string; messageId: number; now: number;
  readMessage: () => Promise<unknown | null>;
  deleteMessage: () => Promise<void>;
  reconcile: (metadata: Record<string, unknown>, deletedAt: string) => Promise<void>;
}) {
  const target = activityCleanupTarget(activity, activityId, messageId, now);
  const before = await readMessage();
  if (before !== null) await deleteMessage();
  if (await readMessage() !== null) throw new Error("activity_cleanup_physical_delete_unconfirmed");
  const deletedAt = new Date(now).toISOString();
  await reconcile({ ...activity.metadata, cityTelegramPublication: {
    ...target.state, active: false, deletedAt, unpinnedAt: deletedAt,
  } }, deletedAt);
  return { state: before === null ? "already_absent" : "deleted", messageId, chatId: target.chatId };
}
