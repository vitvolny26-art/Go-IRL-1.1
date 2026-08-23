import { supabase } from "./supabase";
import {
  buildTelegramForumTopicUrl,
  normalizeExternalTelegramChatUrl,
  type ExternalTelegramChatLink,
} from "./externalTelegramChat";

type ExternalTelegramChatRow = {
  activity_id: string;
  url: string;
  attached_by_user_key: string;
  keep_archive: boolean;
  created_at: string;
  updated_at: string;
  telegram_chat_id: number | null;
  telegram_chat_type: string | null;
  telegram_chat_title: string | null;
  bound_at: string | null;
  telegram_message_thread_id: number | null;
  topic_created_at: string | null;
  topic_delete_after: string | null;
  topic_deleted_at: string | null;
};

const externalTelegramChatColumns = "activity_id,url,attached_by_user_key,keep_archive,created_at,updated_at,telegram_chat_id,telegram_chat_type,telegram_chat_title,bound_at,telegram_message_thread_id,topic_created_at,topic_delete_after,topic_deleted_at";

export const mapExternalTelegramChatRow = (
  row: ExternalTelegramChatRow | null | undefined,
): ExternalTelegramChatLink | null => {
  if (!row) return null;
  const url = normalizeExternalTelegramChatUrl(row.url);
  if (!url || !row.attached_by_user_key || !row.created_at) return null;

  const verified = Boolean(row.telegram_chat_id && row.bound_at && ["group", "supergroup"].includes(row.telegram_chat_type || ""));
  const topicUrl = buildTelegramForumTopicUrl(row.telegram_chat_id, row.telegram_message_thread_id);
  return {
    kind: "event",
    url,
    attachedByUserKey: row.attached_by_user_key,
    attachedAt: row.created_at,
    keepArchive: Boolean(row.keep_archive),
    verificationState: verified ? "verified" : "manual",
    boundAt: verified ? row.bound_at || undefined : undefined,
    telegramChatTitle: verified ? row.telegram_chat_title || undefined : undefined,
    telegramChatId: row.telegram_chat_id || undefined,
    telegramMessageThreadId: row.telegram_message_thread_id || undefined,
    topicUrl: topicUrl || undefined,
    topicDeleteAfter: row.topic_delete_after || undefined,
    topicDeletedAt: row.topic_deleted_at || undefined,
  };
};

export const loadSharedEventTelegramChatLink = async (activityId: string) => {
  if (!activityId) return null;

  const { data, error } = await supabase
    .from("activity_external_telegram_chats")
    .select(externalTelegramChatColumns)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (error) throw error;
  return mapExternalTelegramChatRow(data as ExternalTelegramChatRow | null);
};

export const saveSharedEventTelegramChatLink = async (
  activityId: string,
  value: string,
  attachedByUserKey: string,
  keepArchive = false,
) => {
  const url = normalizeExternalTelegramChatUrl(value);
  if (!activityId || !url || !attachedByUserKey) return null;

  const { data, error } = await supabase
    .from("activity_external_telegram_chats")
    .upsert({
      activity_id: activityId,
      url,
      attached_by_user_key: attachedByUserKey,
      keep_archive: keepArchive,
      telegram_chat_id: null,
      telegram_chat_type: null,
      telegram_chat_title: null,
      bound_at: null,
      telegram_message_thread_id: null,
      topic_created_at: null,
      topic_delete_after: null,
      topic_deleted_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "activity_id" })
    .select(externalTelegramChatColumns)
    .single();

  if (error) throw error;
  return mapExternalTelegramChatRow(data as ExternalTelegramChatRow);
};

export const removeSharedEventTelegramChatLink = async (activityId: string) => {
  if (!activityId) return;
  const { error } = await supabase
    .from("activity_external_telegram_chats")
    .delete()
    .eq("activity_id", activityId);
  if (error) throw error;
};