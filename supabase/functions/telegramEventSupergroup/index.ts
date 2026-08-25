import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  handleRepeatPublicationCallback,
  sendDueRepeatPublicationPrompts,
} from "./repeatPublication.ts";

type LegacyHandler = (request: Request) => Response | Promise<Response>;
type ServeLike = (handler: LegacyHandler) => unknown;

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

const publishCityActivity = async (
  token: string,
  activity: {
    id: string;
    title_ru: string | null;
    title_cs: string | null;
    event_date: string;
    event_time: string | null;
    city_id: string | null;
    address: string;
    visibility: string;
  },
) => {
  if (activity.visibility !== "public") return;
  const destinations: Record<string, number> = {
    praha: -1003976986591,
    olomouc: -1004322361537,
  };
  const chatId = activity.city_id ? destinations[activity.city_id] : undefined;
  if (!chatId) return;
  const match = activity.event_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? `${match[3]}.${match[2]}.${match[1]}` : activity.event_date;
  const title = (activity.title_cs || activity.title_ru || "GO IRL event").trim() || "GO IRL event";
  const time = activity.event_time ? ` ${activity.event_time.slice(0, 5)}` : "";
  await telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: [title, `📅 ${date}${time}`, activity.address ? `📍 ${activity.address}` : "", `https://go-irl.fun/join/${activity.id}`].filter(Boolean).join("\n"),
  });
};

actualServe(async (request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
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
          publishPublicActivity: (activity) => publishCityActivity(botToken, activity),
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
