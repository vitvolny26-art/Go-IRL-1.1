import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

type GoIrlClaims = {
  aud?: string;
  exp?: number;
  iss?: string;
  role?: string;
  sub?: string;
  go_irl_user_key?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const readBearerToken = (request: Request) => {
  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const decodeJson = <T>(value: string): T =>
  JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;

async function verifyGoIrlJwt(token: string, secret: string): Promise<GoIrlClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = decodeJson<{ alg?: string; typ?: string }>(parts[0]);
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
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
    return valid ? decodeJson<GoIrlClaims>(parts[1]) : null;
  } catch {
    return null;
  }
}

const readString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const allowedKinds = new Set(["data_export", "account_deletion"]);
const validCorrelationId = (value: string) => value.length >= 8 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const token = readBearerToken(request);
    if (!token) return json({ error: "access_denied" }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const jwtSecret = requiredEnv("GO_IRL_JWT_SECRET");
    const claims = await verifyGoIrlJwt(token, jwtSecret);
    const now = Math.floor(Date.now() / 1000);
    if (!claims
      || claims.iss !== "go-irl-supabase-edge"
      || claims.aud !== "authenticated"
      || claims.role !== "authenticated"
      || !claims.sub
      || !claims.go_irl_user_key
      || !claims.exp
      || claims.exp <= now) return json({ error: "access_denied" }, 401);

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid_request" }, 400);
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }

    const kind = readString(body.kind);
    const correlationId = readString(body.correlationId) || readString(request.headers.get("x-correlation-id"));
    if (!kind || !allowedKinds.has(kind)) return json({ error: "invalid_kind" }, 400);
    if (!correlationId || !validCorrelationId(correlationId)) return json({ error: "invalid_correlation_id" }, 400);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const appUserResult = await supabase.from("app_users")
      .select("id,user_key,status")
      .eq("user_key", claims.go_irl_user_key)
      .maybeSingle();
    if (appUserResult.error) throw appUserResult.error;
    if (!appUserResult.data
      || appUserResult.data.id !== claims.sub
      || appUserResult.data.status === "deleted") return json({ error: "account_unavailable" }, 403);

    const insertResult = await supabase.from("account_requests").insert({
      user_key: claims.go_irl_user_key,
      kind,
      correlation_id: correlationId,
    }).select("id,kind,status,correlation_id,created_at").single();

    if (insertResult.error?.code === "23505") {
      const existingResult = await supabase.from("account_requests")
        .select("id,kind,status,correlation_id,created_at")
        .eq("user_key", claims.go_irl_user_key)
        .eq("correlation_id", correlationId)
        .maybeSingle();
      if (existingResult.error) throw existingResult.error;
      if (!existingResult.data || existingResult.data.kind !== kind) return json({ error: "correlation_conflict" }, 409);
      return json({ request: existingResult.data, duplicate: true }, 200);
    }
    if (insertResult.error || !insertResult.data) throw insertResult.error || new Error("account_request_insert_failed");
    return json({ request: insertResult.data, duplicate: false }, 202);
  } catch (error) {
    console.error("account_request_failed", error instanceof Error ? error.name : "unknown_error");
    return json({ error: "request_failed" }, 500);
  }
});
