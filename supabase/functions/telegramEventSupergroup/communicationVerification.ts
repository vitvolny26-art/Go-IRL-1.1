import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

type TelegramApi = <T>(method: string, body?: Record<string, unknown>) => Promise<T>;

type CommunicationRouteRow = {
  id: string;
  user_key: string;
  channel: string;
  provider_identity_id: string | null;
  readiness: string;
  capabilities: string[];
  consent_state: string;
  health_state: string;
};

type ProviderIdentityRow = {
  id: string;
  user_key: string;
  provider: string;
  provider_user_id: string;
  status: string;
  consented_at: string | null;
};

type TelegramCallbackQuery = {
  id?: string;
  data?: string;
  from?: { id?: number };
  message?: { chat?: { id?: number }; message_id?: number };
};

type AppUserRow = { user_key: string; language_code: string | null };

const callbackPattern = /^commverify:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const executableCapabilities = ["contact", "inbound", "outbound", "notification"];

const language = (value: string | null | undefined) => {
  const normalized = (value || "").toLowerCase();
  if (normalized.startsWith("uk")) return "uk";
  if (normalized.startsWith("cs")) return "cs";
  if (normalized.startsWith("en")) return "en";
  return "ru";
};

const copy = {
  ru: {
    prompt: "Подтвердите, что GO IRL может использовать этот Telegram для напоминаний, уведомлений и сообщений.",
    confirm: "Подтвердить Telegram",
    success: "Telegram подтверждён как доступный канал связи. Выбрать его основным каналом можно в GO IRL.",
    already: "Этот Telegram уже подтверждён как канал связи.",
    failed: "Не удалось подтвердить Telegram. Откройте GO IRL или попробуйте ещё раз.",
  },
  uk: {
    prompt: "Підтвердьте, що GO IRL може використовувати цей Telegram для нагадувань, сповіщень і повідомлень.",
    confirm: "Підтвердити Telegram",
    success: "Telegram підтверджено як доступний канал зв’язку. Обрати його основним каналом можна в GO IRL.",
    already: "Цей Telegram уже підтверджено як канал зв’язку.",
    failed: "Не вдалося підтвердити Telegram. Відкрийте GO IRL або спробуйте ще раз.",
  },
  cs: {
    prompt: "Potvrďte, že GO IRL může tento Telegram používat pro připomínky, oznámení a zprávy.",
    confirm: "Potvrdit Telegram",
    success: "Telegram byl ověřen jako dostupný komunikační kanál. Jako hlavní kanál ho můžete zvolit v GO IRL.",
    already: "Tento Telegram už je ověřen jako komunikační kanál.",
    failed: "Telegram se nepodařilo ověřit. Otevřete GO IRL nebo to zkuste znovu.",
  },
  en: {
    prompt: "Confirm that GO IRL may use this Telegram account for reminders, notifications, and messages.",
    confirm: "Confirm Telegram",
    success: "Telegram is verified as an available communication channel. You can choose it as your primary channel in GO IRL.",
    already: "This Telegram account is already verified as a communication channel.",
    failed: "Could not verify Telegram. Open GO IRL or try again.",
  },
} as const;

const isExecutable = (route: CommunicationRouteRow) =>
  route.readiness === "ready"
  && route.consent_state === "granted"
  && route.capabilities.includes("outbound")
  && route.capabilities.includes("notification")
  && (route.health_state === "unknown" || route.health_state === "healthy");

const removeKeyboard = async (telegramApi: TelegramApi, callbackQuery: TelegramCallbackQuery) => {
  if (!callbackQuery.message?.chat?.id || !callbackQuery.message.message_id) return;
  try {
    await telegramApi<boolean>("editMessageReplyMarkup", {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    // Verification state is durable; keyboard cleanup is best-effort only.
  }
};

export const parseCommunicationVerificationCallback = (value: string | undefined) => {
  const match = value?.match(callbackPattern);
  return match ? { routeId: match[1].toLowerCase() } : null;
};

export const sendCommunicationVerificationRequests = async ({
  supabase,
  telegramApi,
  userKeys,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  userKeys: string[];
}) => {
  const routeResult = await supabase
    .from("communication_routes")
    .select("id,user_key,channel,provider_identity_id,readiness,capabilities,consent_state,health_state")
    .in("user_key", userKeys)
    .eq("channel", "telegram");
  if (routeResult.error) throw routeResult.error;
  const routes = (routeResult.data || []) as CommunicationRouteRow[];

  const identityIds = routes
    .map((route) => route.provider_identity_id)
    .filter((value): value is string => Boolean(value));
  const identityResult = identityIds.length
    ? await supabase
      .from("user_provider_identities")
      .select("id,user_key,provider,provider_user_id,status,consented_at")
      .in("id", identityIds)
    : { data: [], error: null };
  if (identityResult.error) throw identityResult.error;
  const identities = new Map(
    ((identityResult.data || []) as ProviderIdentityRow[]).map((identity) => [identity.id, identity]),
  );

  const usersResult = await supabase
    .from("app_users")
    .select("user_key,language_code")
    .in("user_key", userKeys);
  if (usersResult.error) throw usersResult.error;
  const userLanguages = new Map(
    ((usersResult.data || []) as AppUserRow[]).map((user) => [user.user_key, language(user.language_code)]),
  );

  const routeByUser = new Map(routes.map((route) => [route.user_key, route]));
  const results: Array<{ userKey: string; status: string; routeId?: string; messageId?: number }> = [];

  for (const userKey of userKeys) {
    const route = routeByUser.get(userKey);
    if (!route?.provider_identity_id) {
      results.push({ userKey, status: "route_missing" });
      continue;
    }
    if (isExecutable(route)) {
      results.push({ userKey, status: "already_verified", routeId: route.id });
      continue;
    }
    if (!["identity_only", "candidate"].includes(route.readiness)) {
      results.push({ userKey, status: "route_unavailable", routeId: route.id });
      continue;
    }
    const identity = identities.get(route.provider_identity_id);
    if (!identity
      || identity.user_key !== userKey
      || identity.provider !== "telegram"
      || identity.status !== "active"
      || !/^\d+$/.test(identity.provider_user_id)) {
      results.push({ userKey, status: "identity_unavailable", routeId: route.id });
      continue;
    }

    const text = copy[userLanguages.get(userKey) || "ru"];
    try {
      const message = await telegramApi<{ message_id: number }>("sendMessage", {
        chat_id: Number(identity.provider_user_id),
        text: text.prompt,
        reply_markup: {
          inline_keyboard: [[{
            text: text.confirm,
            callback_data: `commverify:${route.id}`,
          }]],
        },
      });
      results.push({ userKey, status: "sent", routeId: route.id, messageId: message.message_id });
    } catch {
      results.push({ userKey, status: "send_failed", routeId: route.id });
    }
  }

  return {
    requested: userKeys.length,
    sent: results.filter((result) => result.status === "sent").length,
    skipped: results.filter((result) => result.status !== "sent").length,
    results,
  };
};

export const handleCommunicationVerificationCallback = async ({
  supabase,
  telegramApi,
  callbackQuery,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  callbackQuery: TelegramCallbackQuery;
}) => {
  const parsed = parseCommunicationVerificationCallback(callbackQuery.data);
  if (!parsed) return { handled: false } as const;

  const callbackId = callbackQuery.id;
  const telegramUserId = callbackQuery.from?.id;
  if (!callbackId || !Number.isSafeInteger(telegramUserId)) {
    return { handled: true, rejected: "invalid_callback" } as const;
  }

  const routeResult = await supabase
    .from("communication_routes")
    .select("id,user_key,channel,provider_identity_id,readiness,capabilities,consent_state,health_state")
    .eq("id", parsed.routeId)
    .maybeSingle();
  if (routeResult.error) throw routeResult.error;
  const route = routeResult.data as CommunicationRouteRow | null;
  if (!route || route.channel !== "telegram" || !route.provider_identity_id) {
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: copy.ru.failed,
      show_alert: true,
    });
    return { handled: true, rejected: "route_invalid" } as const;
  }

  const identityResult = await supabase
    .from("user_provider_identities")
    .select("id,user_key,provider,provider_user_id,status,consented_at")
    .eq("id", route.provider_identity_id)
    .maybeSingle();
  if (identityResult.error) throw identityResult.error;
  const identity = identityResult.data as ProviderIdentityRow | null;
  if (!identity
    || identity.user_key !== route.user_key
    || identity.provider !== "telegram"
    || identity.status !== "active"
    || identity.provider_user_id !== String(telegramUserId)) {
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: copy.ru.failed,
      show_alert: true,
    });
    return { handled: true, rejected: "identity_mismatch" } as const;
  }

  const userResult = await supabase
    .from("app_users")
    .select("language_code")
    .eq("user_key", route.user_key)
    .maybeSingle();
  const text = copy[language((userResult.data as { language_code?: string | null } | null)?.language_code)];

  if (isExecutable(route)) {
    await telegramApi<boolean>("answerCallbackQuery", { callback_query_id: callbackId, text: text.already });
    await removeKeyboard(telegramApi, callbackQuery);
    return { handled: true, routeId: route.id, alreadyVerified: true } as const;
  }
  if (!["identity_only", "candidate"].includes(route.readiness)) {
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: text.failed,
      show_alert: true,
    });
    return { handled: true, rejected: "route_unavailable" } as const;
  }

  const consentTimestamp = identity.consented_at || new Date().toISOString();
  const consentResult = await supabase
    .from("user_provider_identities")
    .update({ consented_at: consentTimestamp, updated_at: new Date().toISOString() })
    .eq("id", identity.id)
    .eq("provider", "telegram")
    .eq("provider_user_id", String(telegramUserId))
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (consentResult.error || !consentResult.data) {
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: text.failed,
      show_alert: true,
    });
    return { handled: true, rejected: "consent_update_failed" } as const;
  }

  const capabilities = [...new Set([...route.capabilities, ...executableCapabilities])];
  const updateResult = await supabase.rpc("go_irl_update_communication_route", {
    p_route_id: route.id,
    p_readiness: "ready",
    p_capabilities: capabilities,
    p_consent_state: "granted",
    p_health_state: "healthy",
    p_action: "verified",
  });
  if (updateResult.error) {
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: text.failed,
      show_alert: true,
    });
    return { handled: true, rejected: "route_update_failed" } as const;
  }

  await telegramApi<boolean>("answerCallbackQuery", { callback_query_id: callbackId, text: text.success });
  await removeKeyboard(telegramApi, callbackQuery);
  return { handled: true, routeId: route.id, userKey: route.user_key, verified: true } as const;
};
