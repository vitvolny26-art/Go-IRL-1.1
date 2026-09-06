import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  handleCommunicationVerificationCallback,
  sendCommunicationVerificationRequests,
} from "./communicationVerification.ts";
import { handlePostEventCallback } from "./postEventCallback.ts";
import {
  handleRepeatPublicationCallback,
  sendDueRepeatPublicationPrompts,
} from "./repeatPublication.ts";

type LegacyHandler = (request: Request) => Response | Promise<Response>;
type ServeLike = (handler: LegacyHandler) => unknown;

const cityPublicationEndpoint = "https://go-irl.fun/api/telegram/city-event-publication";
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
const actualServe = Deno.serve.bind(Deno) as ServeLike;
let legacyHandler: LegacyHandler | null = null;
const denoMutable = Deno as unknown as { serve: ServeLike };
const originalServe = denoMutable.serve;

denoMutable.serve = ((handler: LegacyHandler) => {
  legacyHandler = handler;
  return undefined;
}) as ServeLike;
await import("./legacy.ts");
denoMutable.serve = originalServe;

if (!legacyHandler) throw new Error("telegram_legacy_handler_missing");

const safeEqual = (left: string | null, right: string) => {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
};

const telegramApi = async <T>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(`telegram_${method}_failed:${payload.description || response.status}`);
  }
  return payload.result;
};

const jsonProxyResponse = async (response: Response, request?: Request) => new Response(await response.text(), {
  status: response.status,
  headers: {
    ...corsResponseHeaders(request),
    "Content-Type": response.headers.get("Content-Type") || "application/json; charset=utf-8",
  },
});

const callCityPublication = async (
  authorization: string,
  body: Record<string, unknown>,
) => fetch(cityPublicationEndpoint, {
  method: "POST",
  headers: {
    Authorization: authorization,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const readJsonBody = async (request: Request) => {
  try {
    return await request.clone().json() as Record<string, unknown>;
  } catch {
    return null;
  }
};

const boundedProxyDiagnosticText = (value: unknown, limit = 500) => {
  if (typeof value !== "string") return "";
  return value
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
};

const writeCityPublicationProxyFailureAudit = async ({
  supabaseUrl,
  serviceRoleKey,
  activityId,
  metadata,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  activityId: string;
  metadata: Record<string, unknown>;
}) => {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await supabase.from("audit_log").insert({
      actor_user_key: "system",
      action: "activity.city_telegram_publication_proxy_failed",
      entity_type: "activity",
      entity_id: activityId,
      metadata,
    });
    if (result.error) {
      console.error("city_activity_publish_proxy_audit_failed", boundedProxyDiagnosticText(result.error.message) || "unknown");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    console.error("city_activity_publish_proxy_audit_failed", boundedProxyDiagnosticText(detail) || "unknown");
  }
};

actualServe(async (request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";

  if (request.method === "POST") {
    const body = await readJsonBody(request);
    const action = typeof body?.action === "string" ? body.action : "";
    const activityId = typeof body?.activityId === "string" ? body.activityId : "";
    const authorization = request.headers.get("authorization") || "";

    if (activityId && action === "publish_city_activity") {
      try {
        const response = await callCityPublication(authorization, {
          action: "publish",
          activityId,
          language: body?.language,
        });
        if (!response.ok) {
          const responseBody = boundedProxyDiagnosticText(await response.clone().text());
          await writeCityPublicationProxyFailureAudit({
            supabaseUrl,
            serviceRoleKey,
            activityId,
            metadata: {
              kind: "http_response",
              status: response.status,
              response_body: responseBody,
            },
          });
        }
        return jsonProxyResponse(response, request);
      } catch (error) {
        const responseDetail = error instanceof Error ? error.message.slice(0, 500) : "unknown";
        const auditDetail = boundedProxyDiagnosticText(responseDetail) || "unknown";
        await writeCityPublicationProxyFailureAudit({
          supabaseUrl,
          serviceRoleKey,
          activityId,
          metadata: {
            kind: "network_exception",
            detail: auditDetail,
          },
        });
        return new Response(JSON.stringify({ error: "city_activity_publish_unavailable", detail: responseDetail }), {
          status: 502,
          headers: { ...corsResponseHeaders(request), "Content-Type": "application/json; charset=utf-8" },
        });
      }
    }

    if (activityId && action === "unpin_city_activity") {
      try {
        const response = await callCityPublication(authorization, {
          action: "unpin_activity",
          activityId,
        });
        return jsonProxyResponse(response, request);
      } catch {
        return new Response(JSON.stringify({ error: "city_activity_unpin_unavailable" }), {
          status: 502,
          headers: { ...corsResponseHeaders(request), "Content-Type": "application/json; charset=utf-8" },
        });
      }
    }

    if (activityId && action === "sync_joined_telegram_access") {
      try {
        const response = await callCityPublication(authorization, {
          action: "sync_joined_member",
          activityId,
          memberUserKey: body?.memberUserKey,
        });
        return jsonProxyResponse(response, request);
      } catch {
        return new Response(JSON.stringify({ error: "telegram_access_sync_unavailable" }), {
          status: 502,
          headers: { ...corsResponseHeaders(request), "Content-Type": "application/json; charset=utf-8" },
        });
      }
    }

    if (activityId && action === "create_city_topic") {
      try {
        const response = await callCityPublication(authorization, {
          action: "create_city_topic",
          activityId,
        });
        return jsonProxyResponse(response, request);
      } catch {
        return new Response(JSON.stringify({ error: "city_topic_unavailable" }), {
          status: 502,
          headers: { ...corsResponseHeaders(request), "Content-Type": "application/json; charset=utf-8" },
        });
      }
    }
  }

  if (serviceRoleKey && request.method === "POST" && safeEqual(
    request.headers.get("authorization"),
    `Bearer ${serviceRoleKey}`,
  )) {
    const body = await readJsonBody(request);
    if (body?.action === "maintain_city_activity_pins") {
      try {
        const response = await callCityPublication(`Bearer ${serviceRoleKey}`, {
          action: "unpin_due",
          limit: body.limit,
        });
        return jsonProxyResponse(response, request);
      } catch {
        return new Response(JSON.stringify({ error: "city_pin_maintenance_unavailable" }), {
          status: 502,
          headers: { ...corsResponseHeaders(request), "Content-Type": "application/json; charset=utf-8" },
        });
      }
    }
  }

  if (!supabaseUrl || !serviceRoleKey || !botToken || !webhookSecret) {
    return legacyHandler!(request);
  }

  const webhookAuthorized = safeEqual(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret);
  if (webhookAuthorized && request.method === "POST") {
    const clone = request.clone();
    try {
      const update = await clone.json() as { callback_query?: unknown };
      if (update.callback_query) {
        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        const telegram = <T>(method: string, body: Record<string, unknown> = {}) =>
          telegramApi<T>(botToken, method, body);

        const communicationVerificationResult = await handleCommunicationVerificationCallback({
          supabase,
          telegramApi: telegram,
          callbackQuery: update.callback_query as never,
        });
        if (communicationVerificationResult.handled) {
          return new Response(JSON.stringify({ ok: true, communicationVerification: communicationVerificationResult }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const postEventResult = await handlePostEventCallback({
          supabase,
          telegramApi: telegram,
          callbackQuery: update.callback_query as never,
        });
        if (postEventResult.handled) {
          return new Response(JSON.stringify({ ok: true, postEvent: postEventResult }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const repeatResult = await handleRepeatPublicationCallback({
          supabase,
          telegramApi: telegram,
          callbackQuery: update.callback_query as never,
          publishPublicActivity: async (activity) => {
            const response = await callCityPublication(`Bearer ${serviceRoleKey}`, {
              action: "publish",
              activityId: activity.id,
              language: "cs",
            });
            if (!response.ok) throw new Error("repeat_city_activity_publish_failed");
          },
        });
        if (repeatResult.handled) {
          return new Response(JSON.stringify({ ok: true, repeat: repeatResult }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    } catch {
      // Non-POSTEVENT/non-repeat Telegram updates are handled by the unchanged legacy webhook.
    }
  }

  const secretKeys = (() => {
    try {
      const parsed = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, unknown>;
      return Object.values(parsed).filter((value): value is string => typeof value === "string" && value.length > 0);
    } catch {
      return [];
    }
  })();
  const serviceRoleAuthorized = safeEqual(
    request.headers.get("authorization"),
    `Bearer ${serviceRoleKey}`,
  ) || secretKeys.some((key) => safeEqual(request.headers.get("apikey"), key));
  if (serviceRoleAuthorized && request.method === "POST") {
    const clone = request.clone();
    try {
      const body = await clone.json() as { action?: string; limit?: number; userKeys?: unknown };
      if (body.action === "repair_telegram_webhook") {
        const webhookUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/telegramEventSupergroup`;
        const currentWebhookInfo = await telegramApi<{
          url?: string;
          pending_update_count?: number;
          allowed_updates?: string[];
        }>(botToken, "getWebhookInfo");
        const currentAllowedUpdates = Array.isArray(currentWebhookInfo.allowed_updates)
          ? currentWebhookInfo.allowed_updates
          : [];
        const allowedUpdates = currentAllowedUpdates.length > 0 && !currentAllowedUpdates.includes("callback_query")
          ? [...currentAllowedUpdates, "callback_query"]
          : currentAllowedUpdates;

        await telegramApi<boolean>(botToken, "setWebhook", {
          url: webhookUrl,
          secret_token: webhookSecret,
          drop_pending_updates: false,
          ...(allowedUpdates.length > 0 ? { allowed_updates: allowedUpdates } : {}),
        });

        const webhookInfo = await telegramApi<{
          url?: string;
          pending_update_count?: number;
          allowed_updates?: string[];
        }>(botToken, "getWebhookInfo");
        return new Response(JSON.stringify({
          ok: true,
          changedUrl: currentWebhookInfo.url !== webhookUrl,
          webhook: {
            url: webhookInfo.url || "",
            pending_update_count: Number(webhookInfo.pending_update_count || 0),
            allowed_updates: Array.isArray(webhookInfo.allowed_updates) ? webhookInfo.allowed_updates : [],
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (body.action === "send_communication_verification_requests") {
        if (!Array.isArray(body.userKeys)
          || body.userKeys.length < 1
          || body.userKeys.length > 20
          || body.userKeys.some((value) => typeof value !== "string" || !value.startsWith("telegram:"))) {
          return new Response(JSON.stringify({ error: "invalid_communication_verification_targets" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        const result = await sendCommunicationVerificationRequests({
          supabase,
          telegramApi: <T>(method: string, payload: Record<string, unknown> = {}) => telegramApi<T>(botToken, method, payload),
          userKeys: [...new Set(body.userKeys as string[])],
        });
        return new Response(JSON.stringify({ ok: true, ...result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (body.action === "send_repeat_publication_prompts") {
        const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
        const result = await sendDueRepeatPublicationPrompts({
          supabase,
          telegramApi: <T>(method: string, payload: Record<string, unknown> = {}) => telegramApi<T>(botToken, method, payload),
          limit: Number.isInteger(body.limit) ? Math.max(1, Math.min(Number(body.limit), 200)) : 50,
        });
        return new Response(JSON.stringify({ ok: true, ...result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: "invalid_worker_request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return legacyHandler!(request);
});
