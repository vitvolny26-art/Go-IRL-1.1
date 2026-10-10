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

const replacement = "[REDACTED]";

const botTokenPatterns = (botToken: string) => [
  botToken,
  encodeURIComponent(botToken),
].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);

export const sanitizeTelegramText = (value: unknown, botToken: string, limit = 500) => {
  if (typeof value !== "string") return "";
  const withoutConfiguredToken = botTokenPatterns(botToken)
    .reduce((text, token) => text.replaceAll(token, replacement), value);
  return withoutConfiguredToken
    .replace(/bot\d{5,}:[A-Za-z0-9_-]{8,}/gi, `bot${replacement}`)
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{8,}\b/g, replacement)
    .replace(/https?:\/\/[^\s<>'"`]+/gi, "[REDACTED_URL]")
    .replace(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/gi, "[REDACTED_HOST]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]")
    .replace(/\b(?:[a-f0-9]{0,4}:){2,}[a-f0-9:]{0,4}\b/gi, "[REDACTED_IP]")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, Math.max(0, Math.min(limit, 2048)));
};

export const sanitizeTelegramWebhookUrl = (value: unknown, botToken: string) => {
  if (typeof value !== "string" || !value.trim()) return "";
  const withoutToken = botTokenPatterns(botToken)
    .reduce((text, token) => text.replaceAll(token, replacement), value.trim());
  try {
    const parsed = new URL(withoutToken);
    const scheme = parsed.protocol === "https:" ? "https" : parsed.protocol === "http:" ? "http" : "other";
    const path = parsed.pathname && parsed.pathname !== "/" ? "/[REDACTED_PATH]" : "";
    const query = parsed.search ? "?[REDACTED_QUERY]" : "";
    const fragment = parsed.hash ? "#[REDACTED_FRAGMENT]" : "";
    return `${scheme}://[REDACTED_HOST]${path}${query}${fragment}`;
  } catch {
    return "[REDACTED_URL]";
  }
};

const nonNegativeInteger = (value: unknown, fallback: number | null) =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;

const telegramUsername = (value: unknown) => {
  if (typeof value !== "string") return "";
  const username = value.replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,64}$/.test(username) ? username : "";
};

export const buildTelegramWebhookInspection = (
  bot: TelegramBotIdentity,
  webhook: TelegramWebhookInfo,
  botToken: string,
) => ({
  bot: {
    id: Number.isSafeInteger(bot.id) && Number(bot.id) > 0 ? Number(bot.id) : null,
    is_bot: bot.is_bot === true,
    username: telegramUsername(bot.username),
  },
  webhook: {
    url: sanitizeTelegramWebhookUrl(webhook.url, botToken),
    has_custom_certificate: webhook.has_custom_certificate === true,
    pending_update_count: nonNegativeInteger(webhook.pending_update_count, 0),
    ip_address: typeof webhook.ip_address === "string" && webhook.ip_address.trim() ? replacement : "",
    last_error_date: nonNegativeInteger(webhook.last_error_date, null),
    last_error_message: sanitizeTelegramText(webhook.last_error_message, botToken),
    max_connections: nonNegativeInteger(webhook.max_connections, null),
    allowed_updates: Array.isArray(webhook.allowed_updates)
      ? [...new Set(webhook.allowed_updates.filter((value): value is string =>
        typeof value === "string" && /^[a-z_]{1,64}$/.test(value)))].slice(0, 32)
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
  const rawData = typeof callbackQuery.data === "string" ? callbackQuery.data : "";
  if (!rawData.startsWith("kino:")) return { family: "other" as const };
  const data = rawData.length <= 128 ? rawData : "kino:invalid";

  const actorId = Number.isSafeInteger(callbackQuery.from?.id) && Number(callbackQuery.from?.id) > 0
    ? String(callbackQuery.from?.id)
    : "";
  const chatId = Number.isSafeInteger(callbackQuery.message?.chat?.id) && Number(callbackQuery.message?.chat?.id) > 0
    ? String(callbackQuery.message?.chat?.id)
    : "";
  const messageId = callbackQuery.message?.message_id;
  const callbackId = typeof callbackQuery.id === "string" ? callbackQuery.id : "";
  const decision = data.match(/^kino:(approve|skip):(.+)$/i);
  const action = data === "kino:probe" ? "probe" : decision?.[1]?.toLowerCase() || "invalid";
  const candidateId = decision?.[2]?.toLowerCase() || "";

  let rejected = "";
  if (!/^[1-9]\d{0,19}$/.test(expectedOwnerId) || actorId !== expectedOwnerId || chatId !== expectedOwnerId) rejected = "owner_forbidden";
  else if (!callbackId || !Number.isSafeInteger(messageId) || Number(messageId) <= 0) rejected = "message_identity_invalid";
  else if (rawData.length > 128 || action === "invalid" || (action !== "probe" && !uuidPattern.test(candidateId))) rejected = "callback_data_invalid";

  return {
    family: "cinema" as const,
    action,
    candidateId: uuidPattern.test(candidateId) ? candidateId : "",
    callbackIdPresent: Boolean(callbackId),
    messageIdPresent: Number.isSafeInteger(messageId) && Number(messageId) > 0,
    rejected: rejected || null,
  };
};
