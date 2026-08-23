import { getTrustedAccessToken } from "./authSession";
import { getTelegramWebApp } from "./telegram";

export type EventSupergroupBinding = {
  startGroupUrl: string;
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

export const createEventSupergroupBinding = async (
  activityId: string,
): Promise<EventSupergroupBinding> => {
  if (!activityId) throw new Error("activity_id_required");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const accessToken = await getTrustedAccessToken();
  if (!supabaseUrl || !accessToken) throw new Error("trusted_auth_required");

  const response = await fetch(`${supabaseUrl}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "create_binding", activityId }),
  });
  const data = await response.json().catch(() => null) as {
    startGroupUrl?: unknown;
    expiresAt?: unknown;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(data?.error || "supergroup_binding_failed");
  }

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
  if (!activityId) throw new Error("activity_id_required");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const accessToken = await getTrustedAccessToken();
  if (!supabaseUrl || !accessToken) throw new Error("trusted_auth_required");

  const response = await fetch(`${supabaseUrl}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "get_webhook_info", activityId }),
  });
  const data = await response.json().catch(() => null) as {
    webhook?: unknown;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(data?.error || "telegram_webhook_diagnostic_failed");
  }
  if (!isEventSupergroupWebhookInfo(data?.webhook)) {
    throw new Error("invalid_webhook_info_response");
  }

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
