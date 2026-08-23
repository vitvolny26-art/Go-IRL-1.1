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
    description: string,
  ) {
    super(`telegram_${method}_failed:${description}`);
    this.name = "TelegramApiError";
  }
}

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
        };
      };
      const message = update.message;
      const token = parseBindingToken(message?.text, botUsername);
      const bareStart = parseBareStart(message?.text, botUsername);
      const chatId = message?.chat?.id;
      const chatType = message?.chat?.type;
      const senderTelegramId = message?.from?.id;
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
    const allowedActions = new Set(["create_binding", "get_webhook_info", "set_webhook"]);
    if (!body.action || !allowedActions.has(body.action) || !body.activityId) {
      return json({ error: "invalid_request" }, 400);
    }

    const activityResult = await supabase
      .from("activities")
      .select("id,organizer_key")
      .eq("id", body.activityId)
      .maybeSingle();
    if (activityResult.error) throw activityResult.error;
    if (!activityResult.data || activityResult.data.organizer_key !== claims.go_irl_user_key) {
      return json({ error: "organizer_required" }, 403);
    }

    if (body.action === "get_webhook_info") {
      const webhookInfo = await telegramApi<TelegramWebhookInfo>(botToken, "getWebhookInfo");
      return json({ webhook: sanitizeWebhookInfo(webhookInfo, botToken) });
    }

    if (body.action === "set_webhook") {
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
    if (error instanceof TelegramApiError) {
      const operation = error.method === "getWebhookInfo"
        ? "get_webhook_info"
        : error.method === "setWebhook"
        ? "set_webhook"
        : "api";
      return json({ error: `telegram_${operation}_failed` }, 502);
    }
    return json({ error: "supergroup_handshake_failed" }, 500);
  }
});
