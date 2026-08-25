import { createClient } from "@supabase/supabase-js";
import { readEnv } from "../_shared/env.js";
import {
  createCanonicalCityTopic,
  publishCanonicalCityActivity,
  syncJoinedParticipantTelegramAccess,
  unpinCanonicalCityActivity,
  unpinDueCanonicalCityActivities,
} from "../_shared/telegram-city-publication.js";
import { isShareEventId, isShareLanguage } from "../_shared/telegram-share-event.js";

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  end(body?: string): void;
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
};

type Claims = {
  aud?: string;
  exp?: number;
  iss?: string;
  role?: string;
  go_irl_user_key?: string;
  go_irl_role?: string;
};

type RequestBody = {
  action?: unknown;
  activityId?: unknown;
  language?: unknown;
  memberUserKey?: unknown;
  limit?: unknown;
};

const allowedOrigins = new Set(["https://go-irl.fun", "https://go-irl-1-1.vercel.app"]);

const json = (response: VercelResponse, status: number, payload: unknown) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(status).end(JSON.stringify(payload));
};

const headerValue = (request: VercelRequest, name: string) => {
  const raw = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return (Array.isArray(raw) ? raw[0] : raw || "").trim();
};

const safeEqual = (left: string, right: string) => {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const decodeJson = <T>(value: string): T => JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;

const verifyTrustedToken = async (token: string, secret: string): Promise<Claims | null> => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; typ?: string };
  let claims: Claims;
  try {
    header = decodeJson(parts[0]);
    claims = decodeJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "HS256" || header.typ !== "JWT") return null;
  try {
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
      base64UrlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= now
    || claims.iss !== "go-irl-supabase-edge"
    || claims.aud !== "authenticated"
    || claims.role !== "authenticated"
    || !claims.go_irl_user_key) return null;
  return claims;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const origin = headerValue(request, "origin");
  if (origin && !allowedOrigins.has(origin)) return json(response, 403, { error: "origin_not_allowed" });
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return json(response, 405, { error: "method_not_allowed" });

  const supabaseUrl = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const jwtSecret = readEnv("GO_IRL_JWT_SECRET");
  const botToken = readEnv("TELEGRAM_BOT_TOKEN");
  if (!supabaseUrl || !serviceRoleKey || !jwtSecret || !botToken) {
    return json(response, 503, { error: "city_telegram_unavailable" });
  }

  const authorization = headerValue(request, "authorization");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  const serviceRoleAuthorized = safeEqual(bearer, serviceRoleKey);
  const claims = serviceRoleAuthorized ? null : await verifyTrustedToken(bearer, jwtSecret);
  if (!serviceRoleAuthorized && !claims) return json(response, 401, { error: "access_denied" });

  const body = request.body && typeof request.body === "object" ? request.body as RequestBody : null;
  if (!body || typeof body.action !== "string") return json(response, 400, { error: "invalid_request" });

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const telegramApi = async <T>(method: string, payload: Record<string, unknown> = {}): Promise<T> => {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const telegramPayload = await telegramResponse.json() as { ok?: boolean; result?: T; description?: string };
    if (!telegramResponse.ok || !telegramPayload.ok || telegramPayload.result === undefined) {
      throw new Error(`telegram_${method}_failed:${telegramPayload.description || telegramResponse.status}`);
    }
    return telegramPayload.result;
  };

  try {
    if (body.action === "unpin_due") {
      if (!serviceRoleAuthorized) return json(response, 403, { error: "service_role_required" });
      const limit = Number.isInteger(body.limit) ? Number(body.limit) : 100;
      const result = await unpinDueCanonicalCityActivities({ supabase, telegramApi, limit });
      return json(response, 200, { ok: true, ...result });
    }

    if (!isShareEventId(body.activityId)) return json(response, 400, { error: "invalid_event_id" });

    if (body.action === "publish") {
      const language = isShareLanguage(body.language) ? body.language : "cs";
      const result = await publishCanonicalCityActivity({
        supabase,
        telegramApi,
        botToken,
        activityId: body.activityId,
        language,
        organizerKey: claims?.go_irl_user_key,
      });
      return json(response, 200, result);
    }

    if (body.action === "unpin_activity") {
      const actorIsAdmin = claims?.go_irl_role === "admin" || claims?.go_irl_role === "superadmin";
      const result = await unpinCanonicalCityActivity({
        supabase,
        telegramApi,
        activityId: body.activityId,
        organizerKey: serviceRoleAuthorized || actorIsAdmin ? undefined : claims?.go_irl_user_key,
      });
      return json(response, 200, result);
    }

    if (body.action === "sync_joined_member") {
      if (!claims?.go_irl_user_key) return json(response, 403, { error: "user_session_required" });
      const memberUserKey = typeof body.memberUserKey === "string" && body.memberUserKey.trim()
        ? body.memberUserKey.trim().slice(0, 180)
        : undefined;
      const result = await syncJoinedParticipantTelegramAccess({
        supabase,
        telegramApi,
        activityId: body.activityId,
        actorUserKey: claims.go_irl_user_key,
        memberUserKey,
      });
      return json(response, 200, result);
    }

    if (body.action === "create_city_topic") {
      if (!claims?.go_irl_user_key) return json(response, 403, { error: "user_session_required" });
      const topic = await createCanonicalCityTopic({
        supabase,
        telegramApi,
        activityId: body.activityId,
        organizerKey: claims.go_irl_user_key,
      });
      return json(response, 200, { topic });
    }

    return json(response, 400, { error: "invalid_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "organizer_required") return json(response, 403, { error: "organizer_required" });
    if (message === "activity_not_public") return json(response, 409, { error: "activity_not_public" });
    console.error("city_telegram_publication_failed", message);
    return json(response, 502, { error: "city_telegram_operation_failed" });
  }
}
