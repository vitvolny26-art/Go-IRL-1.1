import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  handleRepeatPublicationCallback,
  sendDueRepeatPublicationPrompts,
} from "./repeatPublication.ts";

type LegacyHandler = (request: Request) => Response | Promise<Response>;
type ServeLike = (handler: LegacyHandler) => unknown;

const cityPublicationEndpoint = "https://go-irl-1-1.vercel.app/api/telegram/city-event-publication";
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

const jsonProxyResponse = async (response: Response) => new Response(await response.text(), {
  status: response.status,
  headers: { "Content-Type": response.headers.get("Content-Type") || "application/json; charset=utf-8" },
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

actualServe(async (request) => {
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
        return jsonProxyResponse(response);
      } catch {
        return new Response(JSON.stringify({ error: "city_activity_publish_unavailable" }), {
          status: 502,
          headers: { "Content-Type": "application/json; charset=utf-8" },
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
        return jsonProxyResponse(response);
      } catch {
        return new Response(JSON.stringify({ error: "telegram_access_sync_unavailable" }), {
          status: 502,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
    }

    if (activityId && action === "create_city_topic") {
      try {
        const response = await callCityPublication(authorization, {
          action: "create_city_topic",
          activityId,
        });
        return jsonProxyResponse(response);
      } catch {
        return new Response(JSON.stringify({ error: "city_topic_unavailable" }), {
          status: 502,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";

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
        return jsonProxyResponse(response);
      } catch {
        return new Response(JSON.stringify({ error: "city_pin_maintenance_unavailable" }), {
          status: 502,
          headers: { "Content-Type": "application/json; charset=utf-8" },
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
        const result = await handleRepeatPublicationCallback({
          supabase,
          telegramApi: <T>(method: string, body: Record<string, unknown> = {}) => telegramApi<T>(botToken, method, body),
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
        if (result.handled) {
          return new Response(JSON.stringify({ ok: true, repeat: result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    } catch {
      // Non-repeat Telegram updates are handled by the unchanged legacy webhook.
    }
  }

  const serviceRoleAuthorized = safeEqual(
    request.headers.get("authorization"),
    `Bearer ${serviceRoleKey}`,
  );
  if (serviceRoleAuthorized && request.method === "POST") {
    const clone = request.clone();
    try {
      const body = await clone.json() as { action?: string; limit?: number };
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
