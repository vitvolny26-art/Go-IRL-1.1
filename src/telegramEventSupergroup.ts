import { getTrustedAccessToken } from "./authSession";
import { normalizeExternalTelegramChatUrl } from "./externalTelegramChat";
import { getTelegramWebApp } from "./telegram";

export type EventSupergroupBinding = {
  startGroupUrl: string;
  expiresAt: string;
};

export type EventForumTopic = {
  inviteUrl: string;
  topicUrl: string;
  messageThreadId: number;
  title: string;
  deleteAfter: string;
};

export type EventChatPickerRequest = {
  preparedButtonId: string;
  expiresAt: string;
};

export type EventSupergroupWebhookInfo = {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date: number | null;
  last_error_message: string | null;
  last_synchronization_error_date: number | null;
  max_connections: number | null;
  allowed_updates: string[];
};

type TrustedPostExtras = Record<string, string | number | boolean | null | undefined>;

const isSupportedStartGroupUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "t.me"
      && /^\/[A-Za-z0-9_]{5,}$/.test(url.pathname)
      && /^[A-Za-z0-9_-]{20,64}$/.test(url.searchParams.get("startgroup") || "");
  } catch {
    return false;
  }
};

const isNullableNumber = (value: unknown): value is number | null => value === null || typeof value === "number";
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

const isEventSupergroupWebhookInfo = (value: unknown): value is EventSupergroupWebhookInfo => {
  if (!value || typeof value !== "object") return false;
  const info = value as Record<string, unknown>;
  return typeof info.url === "string"
    && typeof info.has_custom_certificate === "boolean"
    && typeof info.pending_update_count === "number"
    && isNullableNumber(info.last_error_date)
    && isNullableString(info.last_error_message)
    && isNullableNumber(info.last_synchronization_error_date)
    && isNullableNumber(info.max_connections)
    && Array.isArray(info.allowed_updates)
    && info.allowed_updates.every((item) => typeof item === "string");
};

const currentShareLanguage = () => {
  const supported = new Set(["ru", "uk", "cs", "en"]);
  if (typeof window !== "undefined") {
    const pathLanguage = window.location.pathname.replace(/\/+$/, "").split("/").filter(Boolean).at(-1) || "";
    if (supported.has(pathLanguage)) return pathLanguage;
  }
  const stored = typeof localStorage === "undefined" ? "" : localStorage.getItem("go-irl-language") || "";
  return supported.has(stored) ? stored : null;
};

const trustedPost = async (activityId: string, action: string, extras: TrustedPostExtras = {}) => {
  if (!activityId) throw new Error("activity_id_required");
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const accessToken = await getTrustedAccessToken();
  if (!supabaseUrl || !accessToken) throw new Error("trusted_auth_required");
  return fetch(`${supabaseUrl}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, activityId, ...extras }),
  });
};

const parseForumTopic = (data: { topic?: unknown } | null) => {
  if (!data?.topic || typeof data.topic !== "object") throw new Error("invalid_event_forum_topic_response");
  const topic = data.topic as Record<string, unknown>;
  const inviteUrl = typeof topic.inviteUrl === "string" ? normalizeExternalTelegramChatUrl(topic.inviteUrl) : null;
  const topicUrl = typeof topic.topicUrl === "string" ? normalizeExternalTelegramChatUrl(topic.topicUrl) : null;
  if (!inviteUrl || !topicUrl || !Number.isSafeInteger(topic.messageThreadId) || Number(topic.messageThreadId) <= 0
    || typeof topic.title !== "string" || !topic.title || typeof topic.deleteAfter !== "string") {
    throw new Error("invalid_event_forum_topic_response");
  }
  return {
    inviteUrl,
    topicUrl,
    messageThreadId: Number(topic.messageThreadId),
    title: topic.title,
    deleteAfter: topic.deleteAfter,
  } satisfies EventForumTopic;
};

export const createEventForumTopic = async (
  activityId: string,
): Promise<EventForumTopic> => {
  const response = await trustedPost(activityId, "create_topic");
  const data = await response.json().catch(() => null) as { topic?: unknown; error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "event_forum_topic_failed");
  return parseForumTopic(data);
};

export const createCityEventForumTopic = async (
  activityId: string,
): Promise<EventForumTopic> => {
  const response = await trustedPost(activityId, "create_city_topic");
  const data = await response.json().catch(() => null) as { topic?: unknown; error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "event_forum_topic_failed");
  return parseForumTopic(data);
};

export const publishCityActivity = async (activityId: string): Promise<void> => {
  const language = currentShareLanguage();
  const response = await trustedPost(activityId, "publish_city_activity", language ? { language } : {});
  const data = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "city_activity_publish_failed");
};

export const syncJoinedParticipantTelegramAccess = async (
  activityId: string,
  memberUserKey?: string,
): Promise<void> => {
  const response = await trustedPost(
    activityId,
    "sync_joined_telegram_access",
    memberUserKey ? { memberUserKey } : {},
  );
  const data = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "telegram_access_sync_failed");
};

export const prepareEventChatPicker = async (
  activityId: string,
): Promise<EventChatPickerRequest> => {
  const response = await trustedPost(activityId, "prepare_chat_picker");
  const data = await response.json().catch(() => null) as {
    preparedButtonId?: unknown;
    expiresAt?: unknown;
    error?: string;
  } | null;
  if (!response.ok) throw new Error(data?.error || "event_chat_picker_prepare_failed");

  const preparedButtonId = data?.preparedButtonId;
  const expiresAt = data?.expiresAt;
  if (typeof preparedButtonId !== "string" || !preparedButtonId
    || typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("invalid_event_chat_picker_response");
  }
  return { preparedButtonId, expiresAt };
};

export const createEventSupergroupBinding = async (
  activityId: string,
): Promise<EventSupergroupBinding> => {
  const response = await trustedPost(activityId, "create_binding");
  const data = await response.json().catch(() => null) as {
    startGroupUrl?: unknown;
    expiresAt?: unknown;
    error?: string;
  } | null;

  if (!response.ok) throw new Error(data?.error || "supergroup_binding_failed");

  const startGroupUrl = data?.startGroupUrl;
  const expiresAt = data?.expiresAt;
  if (!isSupportedStartGroupUrl(startGroupUrl) || typeof expiresAt !== "string") {
    throw new Error("invalid_supergroup_binding_response");
  }

  return { startGroupUrl, expiresAt };
};

export const getEventSupergroupWebhookInfo = async (
  activityId: string,
): Promise<EventSupergroupWebhookInfo> => {
  const response = await trustedPost(activityId, "get_webhook_info");
  const data = await response.json().catch(() => null) as {
    webhook?: unknown;
    error?: string;
  } | null;

  if (!response.ok) throw new Error(data?.error || "telegram_webhook_diagnostic_failed");
  if (!isEventSupergroupWebhookInfo(data?.webhook)) throw new Error("invalid_webhook_info_response");
  return data.webhook;
};

export const setEventSupergroupWebhook = async (
  activityId: string,
): Promise<EventSupergroupWebhookInfo> => {
  const response = await trustedPost(activityId, "set_webhook");
  const data = await response.json().catch(() => null) as {
    webhook?: unknown;
    error?: string;
    telegram_status?: number;
    telegram_description?: string;
  } | null;

  if (!response.ok) {
    const base = data?.error || "telegram_webhook_setup_failed";
    const detail = typeof data?.telegram_description === "string" && data.telegram_description
      ? `${base}: ${data.telegram_description}`
      : base;
    throw new Error(detail);
  }
  if (!isEventSupergroupWebhookInfo(data?.webhook)) throw new Error("invalid_webhook_info_response");
  return data.webhook;
};

export const openEventSupergroupBinding = (
  startGroupUrl: string,
  dependencies: {
    openTelegramLink?: (url: string) => void;
    openBrowser?: (url: string) => void;
  } = {},
) => {
  if (!isSupportedStartGroupUrl(startGroupUrl)) return false;
  const telegramOpen = dependencies.openTelegramLink || getTelegramWebApp()?.openTelegramLink;
  if (telegramOpen) {
    telegramOpen(startGroupUrl);
    return true;
  }
  if (!dependencies.openBrowser && typeof window === "undefined") return false;
  const browserOpen = dependencies.openBrowser || ((url: string) => window.open(url, "_blank", "noopener,noreferrer"));
  browserOpen(startGroupUrl);
  return true;
};
