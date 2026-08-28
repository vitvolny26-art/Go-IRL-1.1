import { readEnv } from "../_shared/env.js";
import { buildTelegramBeautyCard, buildTelegramEventCard } from "../_shared/telegram-event-card.js";
import { createTelegramShareCardToken } from "../_shared/telegram-share-card-token.js";
import {
  isBeautyShareSlug,
  isShareLanguage as isBeautyShareLanguage,
  loadTrustedBeautyShareArtwork,
  loadTrustedTelegramBeautyCard,
} from "../_shared/telegram-share-beauty.js";
import {
  isShareEventId,
  isShareLanguage as isEventShareLanguage,
  loadTrustedTelegramEventCard,
} from "../_shared/telegram-share-event.js";
import { buildSocialAttributionUrl } from "../../src/socialAttribution.js";
import { TelegramInitDataValidationError, validateTelegramInitData } from "../../supabase/functions/_shared/telegramInitData.js";

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  [Symbol.asyncIterator]?(): AsyncIterator<Uint8Array | string>;
};

type VercelResponse = {
  end(body?: string): void;
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
};

type PreparedShareKind = "event" | "beauty";
type PreparedShareBody = {
  initData?: unknown;
  eventId?: unknown;
  slug?: unknown;
  language?: unknown;
  date?: unknown;
  time?: unknown;
};
type VerifiedUser = Awaited<ReturnType<typeof validateTelegramInitData>>["user"];

const MAX_BODY_BYTES = 16 * 1024;
const allowedBrowserOrigins = new Set(["https://go-irl.fun", "https://go-irl-1-1.vercel.app"]);
const publicAppFallbackOrigin = "https://go-irl.fun";
const telegramMediaOrigin = "https://go-irl-1-1.vercel.app";

const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const publicAppOrigin = () => (readEnv("GO_IRL_PUBLIC_ORIGIN")
  || readEnv("VITE_GO_IRL_PUBLIC_ORIGIN")
  || publicAppFallbackOrigin).replace(/\/+$/, "");

const requestOrigin = (request: VercelRequest) => {
  const raw = request.headers?.origin;
  return (Array.isArray(raw) ? raw[0] : raw || "").trim();
};

const applyBrowserCors = (request: VercelRequest, response: VercelResponse) => {
  const origin = requestOrigin(request);
  if (!origin) return true;
  if (!allowedBrowserOrigins.has(origin)) return false;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
  return true;
};

class RequestBodyTooLargeError extends Error {}

const json = (response: VercelResponse, status: number, payload: unknown) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(status).end(JSON.stringify(payload));
};

const bodySize = (value: string) => new TextEncoder().encode(value).length;

async function readBody(request: VercelRequest) {
  const rawLength = request.headers?.["content-length"];
  const contentLength = Number(Array.isArray(rawLength) ? rawLength[0] : rawLength);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new RequestBodyTooLargeError();
  if (request.body && typeof request.body === "object") {
    const serialized = JSON.stringify(request.body);
    if (bodySize(serialized) > MAX_BODY_BYTES) throw new RequestBodyTooLargeError();
    return request.body;
  }
  if (typeof request.body === "string") {
    if (bodySize(request.body) > MAX_BODY_BYTES) throw new RequestBodyTooLargeError();
    return JSON.parse(request.body) as unknown;
  }
  if (!request[Symbol.asyncIterator]) return null;
  const decoder = new TextDecoder();
  let raw = "";
  let bytes = 0;
  for await (const chunk of request as Required<Pick<VercelRequest, typeof Symbol.asyncIterator>>) {
    const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    bytes += bodySize(text);
    if (bytes > MAX_BODY_BYTES) throw new RequestBodyTooLargeError();
    raw += text;
  }
  raw += decoder.decode();
  if (bodySize(raw) > MAX_BODY_BYTES) throw new RequestBodyTooLargeError();
  return raw ? JSON.parse(raw) as unknown : null;
}

const validBodyForKind = (kind: PreparedShareKind, body: PreparedShareBody | null) => {
  if (!body
    || typeof body.initData !== "string"
    || body.initData.length < 1
    || body.initData.length > 8_192) return false;

  return kind === "beauty"
    ? isBeautyShareSlug(body.slug) && isBeautyShareLanguage(body.language)
    : isShareEventId(body.eventId) && isEventShareLanguage(body.language);
};

async function savePreparedInlineMessage(
  botToken: string,
  userId: number,
  result: unknown,
  failureLog: "telegram_prepare_failed" | "telegram_beauty_prepare_failed",
) {
  const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/savePreparedInlineMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      result,
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
    console.warn(failureLog, { status: telegramResponse.status, description: payload.description || "unknown" });
    return null;
  }
  return payload.result;
}

async function prepareBeautyShare(
  body: PreparedShareBody,
  user: VerifiedUser,
  botToken: string,
  response: VercelResponse,
) {
  const slug = body.slug as string;
  const language = body.language as Parameters<typeof loadTrustedTelegramBeautyCard>[1];
  const appOrigin = publicAppOrigin();
  const card = await loadTrustedTelegramBeautyCard(slug, language, body.date, body.time, appOrigin);
  if (!card) return json(response, 404, { error: "beauty_profile_not_found" });

  const persistedArtwork = await loadTrustedBeautyShareArtwork(card.eventId).catch(() => null);
  const image = new URL("/api/meta/event-preview", telegramMediaOrigin);
  image.searchParams.set("slug", slug);
  image.searchParams.set("language", card.language);
  if (typeof body.date === "string" && body.date.trim()) image.searchParams.set("date", body.date.trim());
  image.searchParams.set("format", "image");
  image.searchParams.set("v", "15");
  const imageUrl = persistedArtwork?.imageUrl || image.toString();
  const landingUrl = buildSocialAttributionUrl(
    new URL(`/s/${encodeURIComponent(slug)}/${card.language}`, appOrigin).toString(),
    { source: "telegram", medium: "message" },
  );
  const prepared = await savePreparedInlineMessage(
    botToken,
    user.id,
    buildTelegramBeautyCard({ ...card, inviteUrl: landingUrl }, imageUrl),
    "telegram_beauty_prepare_failed",
  );
  if (!prepared) return json(response, 502, { error: "telegram_prepare_failed" });

  return json(response, 200, {
    preparedMessageId: prepared.id,
    expiresAt: prepared.expiration_date,
  });
}

async function prepareEventShare(
  body: PreparedShareBody,
  user: VerifiedUser,
  botToken: string,
  response: VercelResponse,
) {
  const eventId = body.eventId as string;
  const language = body.language as Parameters<typeof loadTrustedTelegramEventCard>[1];
  const card = await loadTrustedTelegramEventCard(eventId, language);
  if (!card) return json(response, 404, { error: "event_not_found" });

  const telegramOrganizerKey = `telegram:${user.id}`;
  const verifiedUser = user as typeof user & { photo_url?: string };
  const photoUrl = typeof verifiedUser.photo_url === "string" ? verifiedUser.photo_url.trim() : "";
  if (!card.organizerAvatarUrl && card.organizerKey === telegramOrganizerKey && /^https:\/\//i.test(photoUrl)) {
    card.organizerAvatarUrl = photoUrl;
  }

  const image = new URL("/api/telegram/event-share-card", telegramMediaOrigin);
  image.searchParams.set("mode", "persisted");
  image.searchParams.set("token", createTelegramShareCardToken(card, botToken));
  const prepared = await savePreparedInlineMessage(
    botToken,
    user.id,
    buildTelegramEventCard(card, image.toString()),
    "telegram_prepare_failed",
  );
  if (!prepared) return json(response, 502, { error: "telegram_prepare_failed" });

  return json(response, 200, {
    preparedMessageId: prepared.id,
    expiresAt: prepared.expiration_date,
  });
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!applyBrowserCors(request, response)) return json(response, 403, { error: "origin_not_allowed" });
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    return json(response, 405, { error: "method_not_allowed" });
  }

  const kind = firstQueryValue(request.query?.kind);
  if (kind !== "event" && kind !== "beauty") return json(response, 404, { error: "not_found" });

  const botToken = readEnv("TELEGRAM_BOT_TOKEN");
  if (!botToken) return json(response, 503, { error: "telegram_share_unavailable" });

  let body: PreparedShareBody | null;
  try {
    body = await readBody(request) as PreparedShareBody | null;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return json(response, 413, { error: "payload_too_large" });
    return json(response, 400, { error: "invalid_share_request" });
  }
  if (!validBodyForKind(kind, body)) return json(response, 400, { error: "invalid_share_request" });

  let verified;
  try {
    verified = await validateTelegramInitData({ initData: body!.initData as string, botToken });
  } catch (error) {
    const reason = error instanceof TelegramInitDataValidationError ? error.code : "unknown";
    console.warn(kind === "beauty" ? "telegram_beauty_share_invalid_session" : "telegram_share_invalid_session", { reason });
    return json(response, 401, { error: "invalid_telegram_session" });
  }

  try {
    return kind === "beauty"
      ? await prepareBeautyShare(body!, verified.user, botToken, response)
      : await prepareEventShare(body!, verified.user, botToken, response);
  } catch (error) {
    console.error(
      kind === "beauty" ? "telegram_beauty_prepare_exception" : "telegram_prepare_exception",
      error instanceof Error ? error.message : "unknown",
    );
    return json(response, 503, { error: "telegram_share_unavailable" });
  }
}
