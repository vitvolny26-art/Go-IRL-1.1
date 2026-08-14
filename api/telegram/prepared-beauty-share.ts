import { readEnv } from "../_shared/env.js";
import { buildTelegramBeautyCard } from "../_shared/telegram-event-card.js";
import {
  isBeautyShareSlug,
  isShareLanguage,
  loadTrustedTelegramBeautyCard,
} from "../_shared/telegram-share-beauty.js";
import { TelegramInitDataValidationError, validateTelegramInitData } from "../../supabase/functions/_shared/telegramInitData.js";

type VercelRequest = {
  method?: string;
  body?: unknown;
};

type VercelResponse = {
  end(body?: string): void;
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
};

const publicAppFallbackOrigin = "https://go-irl.fun";

const publicAppOrigin = () => (readEnv("GO_IRL_PUBLIC_ORIGIN")
  || readEnv("VITE_GO_IRL_PUBLIC_ORIGIN")
  || publicAppFallbackOrigin).replace(/\/+$/, "");

const json = (response: VercelResponse, status: number, payload: unknown) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(status).end(JSON.stringify(payload));
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "method_not_allowed" });
  }

  const botToken = readEnv("TELEGRAM_BOT_TOKEN");
  if (!botToken) return json(response, 503, { error: "telegram_share_unavailable" });

  const body = request.body as {
    initData?: unknown;
    slug?: unknown;
    language?: unknown;
    date?: unknown;
    time?: unknown;
  } | null;

  if (!body
    || typeof body.initData !== "string"
    || body.initData.length < 1
    || body.initData.length > 8_192
    || !isBeautyShareSlug(body.slug)
    || !isShareLanguage(body.language)) {
    return json(response, 400, { error: "invalid_share_request" });
  }

  let verified;
  try {
    verified = await validateTelegramInitData({ initData: body.initData, botToken });
  } catch (error) {
    const reason = error instanceof TelegramInitDataValidationError ? error.code : "unknown";
    console.warn("telegram_beauty_share_invalid_session", { reason });
    return json(response, 401, { error: "invalid_telegram_session" });
  }

  try {
    const card = await loadTrustedTelegramBeautyCard(body.slug, body.language, body.date, body.time, publicAppOrigin());
    if (!card) return json(response, 404, { error: "beauty_profile_not_found" });

    const image = new URL("/api/meta/event-preview", publicAppOrigin());
    image.searchParams.set("slug", body.slug);
    image.searchParams.set("language", card.language);
    if (typeof body.date === "string" && body.date.trim()) image.searchParams.set("date", body.date.trim());
    image.searchParams.set("format", "image");
    image.searchParams.set("v", "14");
    const imageUrl = image.toString();
    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/savePreparedInlineMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: verified.user.id,
        result: buildTelegramBeautyCard(card, imageUrl),
        allow_user_chats: true,
        allow_bot_chats: false,
        allow_group_chats: true,
        allow_channel_chats: true,
      }),
    });
    const payload = await telegramResponse.json() as {
      ok?: boolean;
      result?: { id?: string; expiration_date?: number };
      description?: string;
    };
    if (!telegramResponse.ok || !payload.ok || !payload.result?.id) {
      console.warn("telegram_beauty_prepare_failed", { status: telegramResponse.status, description: payload.description || "unknown" });
      return json(response, 502, { error: "telegram_prepare_failed" });
    }

    return json(response, 200, {
      preparedMessageId: payload.result.id,
      expiresAt: payload.result.expiration_date,
    });
  } catch (error) {
    console.error("telegram_beauty_prepare_exception", error instanceof Error ? error.message : "unknown");
    return json(response, 503, { error: "telegram_share_unavailable" });
  }
}
