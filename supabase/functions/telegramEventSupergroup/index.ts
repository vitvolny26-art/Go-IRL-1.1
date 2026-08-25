import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const corsResponseHeaders = (request?: Request) => ({
  ...corsHeaders,
  "Access-Control-Allow-Headers": request?.headers.get("access-control-request-headers")
    || "authorization, x-client-info, x-supabase-api-version, apikey, content-type, x-telegram-bot-api-secret-token",
  Vary: "Access-Control-Request-Headers",
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsResponseHeaders(), "Content-Type": "application/json" },
});

class ConfigurationError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "ConfigurationError";
  }
}

class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly status: number,
    readonly description: string,
  ) {
    super(`telegram_${method}_failed:${description}`);
    this.name = "TelegramApiError";
  }
}

const isValidTelegramWebhookSecret = (value: string) => /^[A-Za-z0-9_-]{1,256}$/.test(value);

const sanitizeTelegramErrorDescription = (value: string) => value
  .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]")
  .slice(0, 500);

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new ConfigurationError(name);
  return value;
};

const base64UrlDecode = (value: string) => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new Uint8Array([...binary].map((char) => char.charCodeAt(0)));
};

const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => hex(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
));

const safeEqual = (left: string | null, right: string) => {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
};

type SessionClaims = {
  aud?: string;
  role?: string;
  exp?: number;
  iss?: string;
  go_irl_user_key?: string;
  go_irl_telegram_id?: number;
};

type PendingBinding = {
  token_hash: string;
  activity_id: string;
  requested_by_user_key: string;
  expires_at: string;
  consumed_at: string | null;
};

type TelegramWebhookInfo = {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  allowed_updates?: string[];
};

type ActivityRow = {
  id: string;
  organizer_key: string;
  title_ru: string | null;
  title_cs: string | null;
  event_date: string;
  event_time: string | null;
  city_id: string | null;
  address: string;
  visibility: string;
  metadata: { sport?: { durationMinutes?: number } } | null;
};

type ExistingTopicRow = {
  telegram_chat_id: number | null;
  telegram_message_thread_id: number | null;
  url: string | null;
  telegram_chat_title: string | null;
  topic_delete_after: string | null;
  topic_deleted_at: string | null;
};

type TelegramChatShared = {
  request_id?: number;
  chat_id?: number;
  title?: string;
  username?: string;
};

const redactBotToken = (value: string | undefined, botToken: string) => {
  if (!value) return null;
  return value.replaceAll(botToken, "[REDACTED]");
};

const sanitizeWebhookInfo = (info: TelegramWebhookInfo, botToken: string) => ({
  url: redactBotToken(info.url, botToken) || "",
  has_custom_certificate: Boolean(info.has_custom_certificate),
  pending_update_count: Number(info.pending_update_count || 0),
  last_error_date: info.last_error_date ?? null,
  last_error_message: redactBotToken(info.last_error_message, botToken),
  last_synchronization_error_date: info.last_synchronization_error_date ?? null,
  max_connections: info.max_connections ?? null,
  allowed_updates: Array.isArray(info.allowed_updates) ? info.allowed_updates : [],
});

const verifySession = async (authorization: string | null, secret: string): Promise<SessionClaims | null> => {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerPart))) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))) as SessionClaims;
    const now = Math.floor(Date.now() / 1000);
    if (!claims.exp || claims.exp <= now) return null;
    if (claims.iss !== "go-irl-supabase-edge" || claims.aud !== "authenticated" || claims.role !== "authenticated") return null;
    if (!claims.go_irl_user_key || !claims.go_irl_telegram_id) return null;
    return claims;
  } catch {
    return null;
  }
};

const telegramApi = async <T>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new TelegramApiError(method, response.status, payload.description || String(response.status));
  }
  return payload.result;
};

const parseBindingToken = (text: string | undefined, botUsername: string) => {
  if (!text) return null;
  const escaped = botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.trim().match(new RegExp(`^/start(?:@${escaped})?\\s+([A-Za-z0-9_-]{20,64})$`, "i"))?.[1] || null;
};

const parseBareStart = (text: string | undefined, botUsername: string) => {
  if (!text) return false;
  const escaped = botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^/start(?:@${escaped})?$`, "i").test(text.trim());
};

const pickerBindingTokenHash = (telegramId: number, requestId: number) =>
  sha256(`chat-picker:${telegramId}:${requestId}`);

const normalizeTelegramChatUrl = (value: string | null | undefined) => {
  const trimmed = value?.trim() || "";
  return /^https:\/\/t\.me\/(?:joinchat\/[-_A-Za-z0-9]+|\+[-_A-Za-z0-9]+|[A-Za-z0-9_]{5,})(?:\/[0-9]+)?$/.test(trimmed)
    ? trimmed
    : null;
};

const telegramUsernameUrl = (value: string | null | undefined) => {
  const username = (value || "").replace(/^@/, "");
  return /^[A-Za-z0-9_]{5,}$/.test(username) ? `https://t.me/${username}` : null;
};

const canonicalChatId = () => {
  const value = Number(requiredEnv("TELEGRAM_EVENT_SUPERGROUP_CHAT_ID"));
  if (!Number.isSafeInteger(value) || value >= 0) throw new Error("telegram_event_supergroup_chat_id_invalid");
  return value;
};

const forumTopicUrl = (chatId: number, messageThreadId: number) => {
  const raw = String(chatId);
  if (!raw.startsWith("-100") || !Number.isSafeInteger(messageThreadId) || messageThreadId <= 0) {
    throw new Error("telegram_forum_topic_url_invalid");
  }
  return `https://t.me/c/${raw.slice(4)}/${messageThreadId}`;
};

const cityTelegramDestinations: Record<string, { chatId: number; label: string }> = {
  praha: { chatId: -1003976986591, label: "Praha" },
  olomouc: { chatId: -1004322361537, label: "Olomouc" },
};

const activityDateLabel = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
};

const activityDisplayTitle = (activity: ActivityRow) =>
  (activity.title_cs || activity.title_ru || "GO IRL event").trim() || "GO IRL event";

const topicTitle = (activity: ActivityRow) => {
  const city = activity.city_id ? cityTelegramDestinations[activity.city_id]?.label || activity.city_id : "GO IRL";
  return `${city} / ${activityDisplayTitle(activity)} / ${activityDateLabel(activity.event_date)}`.slice(0, 128);
};

const topicDeleteAfter = (activity: ActivityRow) => {
  const time = activity.event_time || "00:00:00";
  const start = Date.parse(`${activity.event_date}T${time}Z`);
  if (!Number.isFinite(start)) throw new Error("activity_time_invalid");
  const duration = Number(activity.metadata?.sport?.durationMinutes || 90);
  const durationMinutes = Number.isFinite(duration) && duration > 0 ? duration : 90;
  return new Date(start + durationMinutes * 60_000 + 24 * 60 * 60_000).toISOString();
};

const resolvePendingBinding = async (
  supabase: ReturnType<typeof createClient>,
  senderTelegramId: number,
): Promise<{ binding: PendingBinding | null; ambiguous: boolean }> => {
  const userResult = await supabase
    .from("app_users")
    .select("user_key")
    .eq("telegram_id", senderTelegramId)
    .maybeSingle();
  const senderUserKey = userResult.data?.user_key as string | undefined;
  if (userResult.error || !senderUserKey) return { binding: null, ambiguous: false };

  const pendingResult = await supabase
    .from("activity_telegram_chat_bindings")
    .select("token_hash,activity_id,requested_by_user_key,expires_at,consumed_at")
    .eq("requested_by_user_key", senderUserKey)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(2);
  if (pendingResult.error) throw pendingResult.error;
  const pending = (pendingResult.data || []) as PendingBinding[];
  if (pending.length !== 1) return { binding: null, ambiguous: pending.length > 1 };
  return { binding: pending[0], ambiguous: false };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsResponseHeaders(request) });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const jwtSecret = requiredEnv("GO_IRL_JWT_SECRET");
    const botToken = requiredEnv("TELEGRAM_BOT_TOKEN");
    const webhookSecret = requiredEnv("TELEGRAM_WEBHOOK_SECRET");
    const botUsername = (Deno.env.get("TELEGRAM_BOT_USERNAME") || "GOirl_bot").replace(/^@/, "");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    if (safeEqual(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) {
      const update = await request.json() as {
        message?: {
          text?: string;
          chat?: { id?: number; type?: string; title?: string };
          from?: { id?: number };
          chat_shared?: TelegramChatShared;
        };
      };
      const message = update.message;
      const senderTelegramId = message?.from?.id;
      const sharedChat = message?.chat_shared;
      const replyChatId = message?.chat?.id;

      if (sharedChat && senderTelegramId && replyChatId && message?.chat?.type === "private"
        && Number.isSafeInteger(sharedChat.request_id) && Number.isSafeInteger(sharedChat.chat_id)) {
        const requestId = Number(sharedChat.request_id);
        const selectedChatId = Number(sharedChat.chat_id);
        const tokenHash = await pickerBindingTokenHash(senderTelegramId, requestId);
        const bindingResult = await supabase
          .from("activity_telegram_chat_bindings")
          .select("token_hash,activity_id,requested_by_user_key,expires_at,consumed_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();
        if (bindingResult.error) throw bindingResult.error;
        const binding = bindingResult.data as PendingBinding | null;

        if (!binding || binding.consumed_at || new Date(binding.expires_at).getTime() <= Date.now()) {
          await telegramApi(botToken, "sendMessage", {
            chat_id: replyChatId,
            text: "Выбор чата GO IRL устарел. Вернитесь в событие и выберите чат ещё раз.",
          });
          return json({ ok: true, rejected: "picker_binding_invalid" });
        }

        const userResult = await supabase
          .from("app_users")
          .select("telegram_id")
          .eq("user_key", binding.requested_by_user_key)
          .maybeSingle();
        if (Number(userResult.data?.telegram_id) !== senderTelegramId) {
          return json({ ok: true, rejected: "organizer_mismatch" });
        }

        let selectedChatType = String(selectedChatId).startsWith("-100") ? "supergroup" : "group";
        let selectedChatTitle = sharedChat.title || null;
        let chatUrl = telegramUsernameUrl(sharedChat.username);
        try {
          const chat = await telegramApi<{
            id: number;
            type: string;
            title?: string;
            username?: string;
            invite_link?: string;
          }>(botToken, "getChat", { chat_id: selectedChatId });
          if (chat.id !== selectedChatId || !["group", "supergroup"].includes(chat.type)) {
            return json({ ok: true, rejected: "selected_chat_invalid" });
          }
          selectedChatType = chat.type;
          selectedChatTitle = chat.title || selectedChatTitle;
          chatUrl = telegramUsernameUrl(chat.username)
            || normalizeTelegramChatUrl(chat.invite_link)
            || chatUrl;
        } catch (error) {
          if (!(error instanceof TelegramApiError)) throw error;
        }

        if (!chatUrl) {
          await telegramApi(botToken, "sendMessage", {
            chat_id: replyChatId,
            text: "Чат выбран, но GO IRL не может получить ссылку для участников. Для закрытого чата добавьте GO IRL bot или дайте ему доступ к invite-ссылке, затем выберите чат снова.",
          });
          return json({ ok: true, rejected: "selected_chat_access_required" });
        }

        const now = new Date().toISOString();
        const saveResult = await supabase.from("activity_external_telegram_chats").upsert({
          activity_id: binding.activity_id,
          url: chatUrl,
          attached_by_user_key: binding.requested_by_user_key,
          telegram_chat_id: selectedChatId,
          telegram_chat_type: selectedChatType,
          telegram_chat_title: selectedChatTitle,
          bound_at: now,
          telegram_message_thread_id: null,
          topic_created_at: null,
          topic_delete_after: null,
          topic_deleted_at: null,
          updated_at: now,
        }, { onConflict: "activity_id" });
        if (saveResult.error) throw saveResult.error;

        const consumeResult = await supabase
          .from("activity_telegram_chat_bindings")
          .update({ consumed_at: now })
          .eq("token_hash", tokenHash)
          .is("consumed_at", null);
        if (consumeResult.error) throw consumeResult.error;

        await telegramApi(botToken, "sendMessage", {
          chat_id: replyChatId,
          text: selectedChatTitle
            ? `Чат «${selectedChatTitle}» привязан к событию GO IRL.`
            : "Telegram-чат привязан к событию GO IRL.",
        });
        return json({ ok: true, bound: true });
      }

      const token = parseBindingToken(message?.text, botUsername);
      const bareStart = parseBareStart(message?.text, botUsername);
      const chatId = message?.chat?.id;
      const chatType = message?.chat?.type;
      if ((!token && !bareStart) || !chatId || !senderTelegramId || !["group", "supergroup"].includes(chatType || "")) {
        return json({ ok: true, ignored: true });
      }

      let binding: PendingBinding | null = null;
      let tokenHash: string | null = null;
      if (token) {
        tokenHash = await sha256(token);
        const bindingResult = await supabase
          .from("activity_telegram_chat_bindings")
          .select("token_hash,activity_id,requested_by_user_key,expires_at,consumed_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();
        if (bindingResult.error) throw bindingResult.error;
        binding = bindingResult.data as PendingBinding | null;
      } else {
        const resolved = await resolvePendingBinding(supabase, senderTelegramId);
        if (resolved.ambiguous) {
          await telegramApi(botToken, "sendMessage", {
            chat_id: chatId,
            text: "Есть несколько ожидающих привязок GO IRL. Вернитесь в нужное событие и выберите эту группу ещё раз.",
          });
          return json({ ok: true, rejected: "binding_ambiguous" });
        }
        binding = resolved.binding;
        tokenHash = binding?.token_hash || null;
      }

      if (!binding || !tokenHash || binding.consumed_at || new Date(binding.expires_at).getTime() <= Date.now()) {
        await telegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Ссылка GO IRL недействительна или истекла." });
        return json({ ok: true, rejected: "binding_invalid" });
      }

      const userResult = await supabase
        .from("app_users")
        .select("telegram_id")
        .eq("user_key", binding.requested_by_user_key)
        .maybeSingle();
      if (Number(userResult.data?.telegram_id) !== senderTelegramId) {
        await telegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Привязать чат может только организатор события." });
        return json({ ok: true, rejected: "organizer_mismatch" });
      }

      const senderMember = await telegramApi<{ status: string }>(botToken, "getChatMember", {
        chat_id: chatId,
        user_id: senderTelegramId,
      });
      if (!["creator", "administrator"].includes(senderMember.status)) {
        await telegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Организатор должен быть администратором группы." });
        return json({ ok: true, rejected: "organizer_not_admin" });
      }

      const invite = await telegramApi<{ invite_link: string }>(botToken, "createChatInviteLink", {
        chat_id: chatId,
        name: "GO IRL event",
      });
      const now = new Date().toISOString();
      const saveResult = await supabase.from("activity_external_telegram_chats").upsert({
        activity_id: binding.activity_id,
        url: invite.invite_link,
        attached_by_user_key: binding.requested_by_user_key,
        telegram_chat_id: chatId,
        telegram_chat_type: chatType,
        telegram_chat_title: message?.chat?.title || null,
        bound_at: now,
        updated_at: now,
      }, { onConflict: "activity_id" });
      if (saveResult.error) throw saveResult.error;

      const consumeResult = await supabase
        .from("activity_telegram_chat_bindings")
        .update({ consumed_at: now })
        .eq("token_hash", tokenHash)
        .is("consumed_at", null);
      if (consumeResult.error) throw consumeResult.error;

      await telegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: "Группа привязана к событию GO IRL. Ссылка появится у подтверждённых участников.",
      });
      return json({ ok: true, bound: true });
    }

    const claims = await verifySession(request.headers.get("authorization"), jwtSecret);
    if (!claims) return json({ error: "access_denied" }, 401);

    const body = await request.json() as { action?: string; activityId?: string };
    const allowedActions = new Set(["create_binding", "create_topic", "prepare_chat_picker", "publish_city_activity", "get_webhook_info", "set_webhook"]);
    if (!body.action || !allowedActions.has(body.action) || !body.activityId) {
      return json({ error: "invalid_request" }, 400);
    }

    const activityResult = await supabase
      .from("activities")
      .select("id,organizer_key,title_ru,title_cs,event_date,event_time,city_id,address,visibility,metadata")
      .eq("id", body.activityId)
      .maybeSingle();
    if (activityResult.error) throw activityResult.error;
    const activity = activityResult.data as ActivityRow | null;
    if (!activity || activity.organizer_key !== claims.go_irl_user_key) {
      return json({ error: "organizer_required" }, 403);
    }

    if (body.action === "publish_city_activity") {
      if (activity.visibility !== "public") {
        return json({ published: false, skipped: "visibility" });
      }
      const destination = activity.city_id ? cityTelegramDestinations[activity.city_id] : undefined;
      if (!destination) {
        return json({ published: false, skipped: "city" });
      }
      const time = activity.event_time ? ` ${activity.event_time.slice(0, 5)}` : "";
      const text = [
        activityDisplayTitle(activity),
        `📅 ${activityDateLabel(activity.event_date)}${time}`,
        activity.address ? `📍 ${activity.address}` : "",
        `https://go-irl.fun/join/${activity.id}`,
      ].filter(Boolean).join("\n");
      await telegramApi(botToken, "sendMessage", {
        chat_id: destination.chatId,
        text,
      });
      return json({ published: true, chatId: destination.chatId });
    }

    if (body.action === "prepare_chat_picker") {
      const organizerTelegramId = Number(claims.go_irl_telegram_id);
      const requestId = (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1;
      const tokenHash = await pickerBindingTokenHash(organizerTelegramId, requestId);
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const prepared = await telegramApi<{ id: string }>(botToken, "savePreparedKeyboardButton", {
        user_id: organizerTelegramId,
        button: {
          text: "GO IRL event chat",
          request_chat: {
            request_id: requestId,
            chat_is_channel: false,
            request_title: true,
            request_username: true,
          },
        },
      });

      const deleteResult = await supabase
        .from("activity_telegram_chat_bindings")
        .delete()
        .eq("activity_id", body.activityId)
        .is("consumed_at", null);
      if (deleteResult.error) throw deleteResult.error;

      const insertResult = await supabase.from("activity_telegram_chat_bindings").insert({
        token_hash: tokenHash,
        activity_id: body.activityId,
        requested_by_user_key: claims.go_irl_user_key,
        expires_at: expiresAt,
      });
      if (insertResult.error) throw insertResult.error;

      return json({ preparedButtonId: prepared.id, expiresAt });
    }

    if (body.action === "create_topic") {
      const chatId = canonicalChatId();
      const existingResult = await supabase
        .from("activity_external_telegram_chats")
        .select("telegram_chat_id,telegram_message_thread_id,url,telegram_chat_title,topic_delete_after,topic_deleted_at")
        .eq("activity_id", body.activityId)
        .maybeSingle();
      if (existingResult.error) throw existingResult.error;
      const existing = existingResult.data as ExistingTopicRow | null;
      if (existing?.telegram_chat_id === chatId && existing.telegram_message_thread_id && !existing.topic_deleted_at && existing.url) {
        return json({
          topic: {
            inviteUrl: existing.url,
            topicUrl: forumTopicUrl(chatId, existing.telegram_message_thread_id),
            messageThreadId: existing.telegram_message_thread_id,
            title: existing.telegram_chat_title || topicTitle(activity),
            deleteAfter: existing.topic_delete_after || topicDeleteAfter(activity),
          },
          reused: true,
        });
      }

      const chat = await telegramApi<{ id: number; type: string; title?: string; is_forum?: boolean }>(botToken, "getChat", {
        chat_id: chatId,
      });
      if (chat.id !== chatId || chat.type !== "supergroup" || !chat.is_forum) {
        return json({ error: "telegram_event_supergroup_forum_required" }, 409);
      }

      const invite = await telegramApi<{ invite_link: string }>(botToken, "createChatInviteLink", {
        chat_id: chatId,
        name: `GO IRL ${body.activityId}`.slice(0, 32),
      });
      const created = await telegramApi<{ message_thread_id: number; name: string }>(botToken, "createForumTopic", {
        chat_id: chatId,
        name: topicTitle(activity),
      });
      const now = new Date().toISOString();
      const deleteAfter = topicDeleteAfter(activity);
      const saveResult = await supabase.from("activity_external_telegram_chats").upsert({
        activity_id: body.activityId,
        url: invite.invite_link,
        attached_by_user_key: claims.go_irl_user_key,
        telegram_chat_id: chatId,
        telegram_chat_type: "supergroup",
        telegram_chat_title: chat.title || "GO IRL",
        bound_at: now,
        telegram_message_thread_id: created.message_thread_id,
        topic_created_at: now,
        topic_delete_after: deleteAfter,
        topic_deleted_at: null,
        updated_at: now,
      }, { onConflict: "activity_id" });
      if (saveResult.error) throw saveResult.error;

      return json({
        topic: {
          inviteUrl: invite.invite_link,
          topicUrl: forumTopicUrl(chatId, created.message_thread_id),
          messageThreadId: created.message_thread_id,
          title: created.name,
          deleteAfter,
        },
        reused: false,
      });
    }

    if (body.action === "get_webhook_info") {
      const webhookInfo = await telegramApi<TelegramWebhookInfo>(botToken, "getWebhookInfo");
      return json({ webhook: sanitizeWebhookInfo(webhookInfo, botToken) });
    }

    if (body.action === "set_webhook") {
      if (!isValidTelegramWebhookSecret(webhookSecret)) {
        return json({ error: "telegram_webhook_secret_invalid_format" }, 500);
      }
      const webhookUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/telegramEventSupergroup`;
      const currentWebhookInfo = await telegramApi<TelegramWebhookInfo>(botToken, "getWebhookInfo");
      if (currentWebhookInfo.url === webhookUrl) {
        return json({ webhook: sanitizeWebhookInfo(currentWebhookInfo, botToken) });
      }
      if (currentWebhookInfo.url) throw new Error("telegram_webhook_conflict");

      await telegramApi<boolean>(botToken, "setWebhook", {
        url: webhookUrl,
        secret_token: webhookSecret,
        drop_pending_updates: true,
      });
      const webhookInfo = await telegramApi<TelegramWebhookInfo>(botToken, "getWebhookInfo");
      return json({ webhook: sanitizeWebhookInfo(webhookInfo, botToken) });
    }

    const bindingToken = base64UrlEncode(crypto.getRandomValues(new Uint8Array(24)));
    const tokenHash = await sha256(bindingToken);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

    const deleteResult = await supabase
      .from("activity_telegram_chat_bindings")
      .delete()
      .eq("activity_id", body.activityId)
      .is("consumed_at", null);
    if (deleteResult.error) throw deleteResult.error;

    const insertResult = await supabase.from("activity_telegram_chat_bindings").insert({
      token_hash: tokenHash,
      activity_id: body.activityId,
      requested_by_user_key: claims.go_irl_user_key,
      expires_at: expiresAt,
    });
    if (insertResult.error) throw insertResult.error;

    return json({
      startGroupUrl: `https://t.me/${botUsername}?startgroup=${bindingToken}`,
      expiresAt,
    });
  } catch (error) {
    console.error(error);
    if (error instanceof ConfigurationError) {
      return json({ error: "server_configuration_missing" }, 500);
    }
    if (error instanceof Error && error.message === "telegram_webhook_conflict") {
      return json({ error: "telegram_webhook_conflict" }, 409);
    }
    if (error instanceof Error && error.message === "telegram_event_supergroup_chat_id_invalid") {
      return json({ error: "telegram_event_supergroup_config_invalid" }, 500);
    }
    if (error instanceof TelegramApiError) {
      const operation = error.method === "getWebhookInfo"
        ? "get_webhook_info"
        : error.method === "setWebhook"
        ? "set_webhook"
        : error.method === "savePreparedKeyboardButton"
        ? "prepare_chat_picker"
        : error.method === "getChat"
        ? "get_chat"
        : error.method === "createChatInviteLink"
        ? "create_chat_invite_link"
        : error.method === "createForumTopic"
        ? "create_forum_topic"
        : error.method === "sendMessage"
        ? "send_message"
        : "api";
      if (error.method === "setWebhook") {
        return json({
          error: "telegram_set_webhook_failed",
          telegram_status: error.status,
          telegram_description: sanitizeTelegramErrorDescription(error.description),
        }, 502);
      }
      return json({ error: `telegram_${operation}_failed` }, 502);
    }
    return json({ error: "supergroup_handshake_failed" }, 500);
  }
});