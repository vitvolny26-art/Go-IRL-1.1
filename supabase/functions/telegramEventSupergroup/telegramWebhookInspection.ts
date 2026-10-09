export type TelegramBotIdentity = {
  id?: number;
  is_bot?: boolean;
  username?: string;
};

export type TelegramWebhookInfo = {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
};

const sanitizeTelegramText = (value: unknown, botToken: string, limit = 500) => {
  if (typeof value !== "string") return "";
  return value
    .replaceAll(botToken, "[REDACTED]")
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, limit);
};

export const buildTelegramWebhookInspection = (
  bot: TelegramBotIdentity,
  webhook: TelegramWebhookInfo,
  botToken: string,
) => ({
  bot: {
    id: Number.isSafeInteger(bot.id) ? Number(bot.id) : null,
    is_bot: bot.is_bot === true,
    username: typeof bot.username === "string" ? bot.username.replace(/^@/, "").slice(0, 64) : "",
  },
  webhook: {
    url: sanitizeTelegramText(webhook.url, botToken, 2048),
    has_custom_certificate: webhook.has_custom_certificate === true,
    pending_update_count: Number(webhook.pending_update_count || 0),
    ip_address: sanitizeTelegramText(webhook.ip_address, botToken, 128),
    last_error_date: Number.isSafeInteger(webhook.last_error_date) ? Number(webhook.last_error_date) : null,
    last_error_message: sanitizeTelegramText(webhook.last_error_message, botToken),
    max_connections: Number.isSafeInteger(webhook.max_connections) ? Number(webhook.max_connections) : null,
    allowed_updates: Array.isArray(webhook.allowed_updates)
      ? webhook.allowed_updates.filter((value): value is string => typeof value === "string").slice(0, 32)
      : [],
  },
});

type TelegramCallbackQuery = {
  id?: string;
  data?: string;
  from?: { id?: number };
  message?: { chat?: { id?: number }; message_id?: number };
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const inspectCinemaCallbackIdentity = (
  callbackQuery: TelegramCallbackQuery,
  expectedOwnerId: string,
) => {
  const data = typeof callbackQuery.data === "string" ? callbackQuery.data : "";
  if (!data.startsWith("kino:")) return { family: "other" as const };

  const actorId = String(callbackQuery.from?.id || "");
  const chatId = String(callbackQuery.message?.chat?.id || "");
  const messageId = callbackQuery.message?.message_id;
  const callbackId = typeof callbackQuery.id === "string" ? callbackQuery.id : "";
  const decision = data.match(/^kino:(approve|skip):(.+)$/i);
  const action = data === "kino:probe" ? "probe" : decision?.[1]?.toLowerCase() || "invalid";
  const candidateId = decision?.[2]?.toLowerCase() || "";

  let rejected = "";
  if (!expectedOwnerId || actorId !== expectedOwnerId || chatId !== expectedOwnerId) rejected = "owner_forbidden";
  else if (!callbackId || !Number.isSafeInteger(messageId) || Number(messageId) <= 0) rejected = "message_identity_invalid";
  else if (action === "invalid" || (action !== "probe" && !uuidPattern.test(candidateId))) rejected = "callback_data_invalid";

  return {
    family: "cinema" as const,
    action,
    candidateId: uuidPattern.test(candidateId) ? candidateId : "",
    actorId,
    chatId,
    messageId: Number.isSafeInteger(messageId) ? Number(messageId) : null,
    callbackIdPresent: Boolean(callbackId),
    rejected: rejected || null,
  };
};
