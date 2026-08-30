import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

type GoIrlClaims = {
  aud?: string;
  exp?: number;
  iss?: string;
  role?: string;
  sub?: string;
  go_irl_user_key?: string;
  go_irl_auth_provider?: string;
};

type TransferRpcRow = {
  status: string;
  transfer_id: string | null;
  profile_id: string | null;
  current_owner_user_key?: string | null;
  candidate_user_key?: string | null;
};

type JwtVerificationResult = { ok: true; claims: GoIrlClaims } | { ok: false };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-beauty-transfer-token, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
});
const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
const readBearerToken = (request: Request) => request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
const base64Url = (input: Uint8Array | string) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const base64UrlToBytes = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (character) => character.charCodeAt(0));
};
const decodeJson = <T>(value: string): T => JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;

async function verifyGoIrlJwt(token: string, secret: string): Promise<JwtVerificationResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };
  try {
    const header = decodeJson<{ alg?: string; typ?: string }>(parts[0]);
    if (header.alg !== "HS256" || header.typ !== "JWT") return { ok: false };
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return valid ? { ok: true, claims: decodeJson<GoIrlClaims>(parts[1]) } : { ok: false };
  } catch { return { ok: false }; }
}

async function signJwt(payload: Record<string, unknown>, secret: string) {
  const encodedHeader = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return `${data}.${base64Url(signature)}`;
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function notifySuperadmins(transferId: string, profileId: string, currentOwner: string, candidate: string) {
  const token = Deno.env.get("GO_IRL_NOTIFICATION_BOT_TOKEN")?.trim() || "";
  const chats = (Deno.env.get("GO_IRL_SUPERADMIN_NOTIFICATION_CHAT_IDS") || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!token || !chats.length) throw new Error("notification_bot_not_configured");
  const origin = (Deno.env.get("GO_IRL_ADMIN_ORIGIN") || "https://go-irl.fun").replace(/\/$/, "");
  const adminUrl = `${origin}/admin?beauty_transfer=${encodeURIComponent(transferId)}`;
  const text = `🔐 GO IRL: запрос передачи кабинета мастера\nProfile: ${profileId}\n${currentOwner} → ${candidate}`;
  for (const chatId of chats) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "Открыть в Admin", url: adminUrl }]] } }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean } | null;
    if (!response.ok || payload?.ok !== true) throw new Error("notification_bot_send_failed");
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const goIrlToken = readBearerToken(request);
    const transferToken = request.headers.get("x-beauty-transfer-token")?.trim() || "";
    const body = await request.json().catch(() => null) as { action?: string } | null;
    const action = body?.action === "status" ? "status" : "claim";
    if (!goIrlToken) return json({ error: "access_denied" }, 401);
    if (!/^[A-Za-z0-9_-]{43}$/.test(transferToken)) return json({ error: "invalid_transfer" }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const jwtSecret = requiredEnv("GO_IRL_JWT_SECRET");
    const sessionTtlSeconds = Number(Deno.env.get("GO_IRL_SESSION_TTL_SECONDS") || 3600);
    const verification = await verifyGoIrlJwt(goIrlToken, jwtSecret);
    if (!verification.ok) return json({ error: "access_denied" }, 401);
    const { claims } = verification;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== "go-irl-supabase-edge" || claims.aud !== "authenticated" || claims.role !== "authenticated" || claims.go_irl_auth_provider !== "google" || !claims.sub || !claims.go_irl_user_key || !claims.exp || claims.exp <= now) {
      return json({ error: "google_trusted_session_required" }, 403);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const userResult = await supabase.from("app_users").select("id,user_key,status").eq("user_key", claims.go_irl_user_key).maybeSingle();
    if (userResult.error) throw userResult.error;
    if (!userResult.data || userResult.data.id !== claims.sub || userResult.data.status !== "active") return json({ error: "access_denied" }, 403);

    const tokenHash = await sha256Hex(transferToken);
    const rpcName = action === "claim" ? "go_irl_claim_beauty_workspace_owner_transfer" : "go_irl_get_beauty_workspace_owner_transfer_status";
    const rpcArgs = action === "claim"
      ? { p_token_hash: tokenHash, p_candidate_user_key: claims.go_irl_user_key }
      : { p_token_hash: tokenHash, p_candidate_user_key: claims.go_irl_user_key };
    const transferResult = await supabase.rpc(rpcName, rpcArgs).single<TransferRpcRow>();
    if (transferResult.error || !transferResult.data) throw transferResult.error || new Error("owner_transfer_rpc_no_row");
    const transfer = transferResult.data;

    if (action === "claim" && (transfer.status === "pending_superadmin") && transfer.transfer_id && transfer.profile_id && transfer.current_owner_user_key && transfer.candidate_user_key) {
      try { await notifySuperadmins(transfer.transfer_id, transfer.profile_id, transfer.current_owner_user_key, transfer.candidate_user_key); }
      catch (error) { console.error("beauty_owner_transfer_notification_failed", error instanceof Error ? error.message : "unknown"); }
    }

    if (transfer.status === "approved" && transfer.transfer_id && transfer.profile_id) {
      const [roleResult, profileResult] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_key", claims.go_irl_user_key).maybeSingle(),
        supabase.from("beauty_professional_profiles").select("id,owner_user_key").eq("id", transfer.profile_id).maybeSingle(),
      ]);
      if (roleResult.error) throw roleResult.error;
      if (profileResult.error) throw profileResult.error;
      if (roleResult.data?.role !== "professional" || profileResult.data?.owner_user_key !== claims.go_irl_user_key) return json({ error: "ownership_state_mismatch" }, 409);
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = issuedAt + sessionTtlSeconds;
      const accessToken = await signJwt({ aud: "authenticated", role: "authenticated", sub: claims.sub, iat: issuedAt, exp: expiresAt, iss: "go-irl-supabase-edge", go_irl_user_key: claims.go_irl_user_key, go_irl_auth_provider: "google", go_irl_role: "professional" }, jwtSecret);
      return json({ status: "approved", transferId: transfer.transfer_id, profileId: transfer.profile_id, session: { access_token: accessToken, token_type: "bearer", expires_in: sessionTtlSeconds, expires_at: expiresAt }, user: { id: claims.sub, userKey: claims.go_irl_user_key, provider: "google", role: "professional" } });
    }

    if (transfer.status === "pending_superadmin" || transfer.status === "already_claimed") {
      return json({ status: "pending_superadmin", transferId: transfer.transfer_id, profileId: transfer.profile_id });
    }
    if (transfer.status === "rejected") return json({ status: "rejected", transferId: transfer.transfer_id, profileId: transfer.profile_id }, 409);
    const gone = transfer.status === "invalid" || transfer.status === "expired_or_revoked";
    return json({ status: transfer.status, transferId: transfer.transfer_id, profileId: transfer.profile_id }, gone ? 410 : 409);
  } catch (error) {
    console.error("beauty_owner_transfer_failed", error instanceof Error ? error.name : "unknown_error");
    return json({ error: "owner_transfer_failed" }, 500);
  }
});
