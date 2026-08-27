import { requireEnv } from "../_shared/env.js";
import { isShareEventId, loadTrustedTelegramEventCard } from "../_shared/telegram-share-event.js";
import { ensureActivitySharePublicAlias, persistActivityShareCard } from "../_shared/activity-share-card-storage.js";
import { persistSocialShareVariants, socialShareLanguages } from "../_shared/social-share-card-storage.js";

type VercelRequest = { method?: string; body?: unknown; headers?: Record<string, string | string[] | undefined> };
type VercelResponse = { end(body?: string): void; setHeader(name: string, value: string): void; status(code: number): VercelResponse };
type Claims = { aud?: string; exp?: number; iss?: string; role?: string; go_irl_user_key?: string };
const allowedOrigins = new Set(["https://go-irl.fun", "https://go-irl-1-1.vercel.app"]);
const json = (response: VercelResponse, status: number, payload: unknown) => { response.setHeader("Content-Type", "application/json; charset=utf-8"); response.setHeader("Cache-Control", "no-store"); response.status(status).end(JSON.stringify(payload)); };
const headerValue = (request: VercelRequest, name: string) => { const raw = request.headers?.[name] ?? request.headers?.[name.toLowerCase()]; return (Array.isArray(raw) ? raw[0] : raw || "").trim(); };
const base64UrlToBytes = (value: string) => { const normalized = value.replaceAll("-", "+").replaceAll("_", "/"); const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="); return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)); };
const decodeJson = <T>(value: string): T => JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
async function verifyTrustedToken(token: string): Promise<Claims | null> { const parts = token.split("."); if (parts.length !== 3) return null; let header: { alg?: string; typ?: string }; let claims: Claims; try { header = decodeJson(parts[0]); claims = decodeJson(parts[1]); } catch { return null; } if (header.alg !== "HS256" || header.typ !== "JWT") return null; try { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(requireEnv("GO_IRL_JWT_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); const valid = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)); if (!valid) return null; } catch { return null; } const now = Math.floor(Date.now() / 1000); if (!claims.exp || claims.exp <= now || claims.iss !== "go-irl-supabase-edge" || claims.aud !== "authenticated" || claims.role !== "authenticated" || !claims.go_irl_user_key) return null; return claims; }

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const origin = headerValue(request, "origin");
  if (origin && !allowedOrigins.has(origin)) return json(response, 403, { error: "origin_not_allowed" });
  if (origin) { response.setHeader("Access-Control-Allow-Origin", origin); response.setHeader("Vary", "Origin"); }
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return json(response, 405, { error: "method_not_allowed" });
  const token = headerValue(request, "authorization").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  const claims = token ? await verifyTrustedToken(token) : null;
  if (!claims) return json(response, 401, { error: "access_denied" });
  const body = request.body && typeof request.body === "object" ? request.body as { eventId?: unknown } : null;
  if (!body || !isShareEventId(body.eventId)) return json(response, 400, { error: "invalid_event_id" });
  try {
    const cards = await Promise.all(socialShareLanguages.map((language) => loadTrustedTelegramEventCard(body.eventId as string, language, { includeParticipants: false })));
    if (cards.some((card) => !card)) return json(response, 404, { error: "event_not_found" });
    const localizedCards = cards as Array<NonNullable<(typeof cards)[number]>>;
    if (localizedCards.some((card) => card.organizerKey !== claims.go_irl_user_key)) return json(response, 403, { error: "organizer_required" });
    const alias = await ensureActivitySharePublicAlias(localizedCards[0]);
    await Promise.all(localizedCards.flatMap((card) => [
      persistActivityShareCard(card, alias),
      persistSocialShareVariants(card, "activity", card.eventId),
    ]));
    return json(response, 200, { ok: true, alias, telegramCards: localizedCards.length, socialAssets: localizedCards.length * 2 });
  } catch (error) {
    console.error("activity_share_card_persist_failed", error instanceof Error ? error.message : "unknown");
    return json(response, 503, { error: "share_card_persistence_unavailable" });
  }
}
