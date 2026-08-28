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

type ClaimRpcRow = {
  status: "accepted" | "already_claimed" | "invalid" | "expired_or_revoked" | "role_conflict" | "profile_conflict" | "user_unavailable";
  request_id: string | null;
  profile_id: string | null;
  slug: string | null;
  assigned_role: string | null;
};

type JwtVerificationResult = { ok: true; claims: GoIrlClaims } | { ok: false };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-beauty-claim-token, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
  },
});

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const readBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

const base64Url = (input: Uint8Array | string) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const decodeJson = <T>(value: string): T =>
  JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;

async function verifyGoIrlJwt(token: string, secret: string): Promise<JwtVerificationResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };
  try {
    const header = decodeJson<{ alg?: string; typ?: string }>(parts[0]);
    if (header.alg !== "HS256" || header.typ !== "JWT") return { ok: false };
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
    if (!valid) return { ok: false };
    return { ok: true, claims: decodeJson<GoIrlClaims>(parts[1]) };
  } catch {
    return { ok: false };
  }
}

async function signJwt(payload: Record<string, unknown>, secret: string) {
  const encodedHeader = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)));
  return `${data}.${base64Url(signature)}`;
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const goIrlToken = readBearerToken(request);
    const claimToken = request.headers.get("x-beauty-claim-token")?.trim() || "";
    if (!goIrlToken) return json({ error: "access_denied" }, 401);
    if (!/^[A-Za-z0-9_-]{43}$/.test(claimToken)) return json({ error: "invalid_claim" }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const jwtSecret = requiredEnv("GO_IRL_JWT_SECRET");
    const sessionTtlSeconds = Number(Deno.env.get("GO_IRL_SESSION_TTL_SECONDS") || 3600);

    const verification = await verifyGoIrlJwt(goIrlToken, jwtSecret);
    if (!verification.ok) return json({ error: "access_denied" }, 401);

    const { claims } = verification;
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.iss !== "go-irl-supabase-edge"
      || claims.aud !== "authenticated"
      || claims.role !== "authenticated"
      || claims.go_irl_auth_provider !== "google"
      || !claims.sub
      || !claims.go_irl_user_key
      || !claims.exp
      || claims.exp <= now
    ) return json({ error: "google_trusted_session_required" }, 403);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const appUserResult = await supabase
      .from("app_users")
      .select("id,user_key,status")
      .eq("user_key", claims.go_irl_user_key)
      .maybeSingle();
    if (appUserResult.error) throw appUserResult.error;
    if (
      !appUserResult.data
      || appUserResult.data.id !== claims.sub
      || appUserResult.data.status !== "active"
    ) return json({ error: "access_denied" }, 403);

    const tokenHash = await sha256Hex(claimToken);
    const claimResult = await supabase.rpc("go_irl_claim_beauty_master_onboarding", {
      p_token_hash: tokenHash,
      p_user_key: claims.go_irl_user_key,
    }).single<ClaimRpcRow>();
    if (claimResult.error || !claimResult.data) {
      throw claimResult.error || new Error("Beauty onboarding claim RPC returned no row");
    }

    const claim = claimResult.data;
    if (claim.status !== "accepted") {
      const status = claim.status === "invalid" || claim.status === "expired_or_revoked" ? 410 : 409;
      return json({
        status: claim.status,
        requestId: claim.request_id,
        profileId: claim.profile_id,
      }, status);
    }

    const roleResult = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_key", claims.go_irl_user_key)
      .maybeSingle();
    if (roleResult.error) throw roleResult.error;
    if (roleResult.data?.role !== "professional") {
      throw new Error("Beauty onboarding role refresh mismatch");
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + sessionTtlSeconds;
    const accessToken = await signJwt({
      aud: "authenticated",
      role: "authenticated",
      sub: claims.sub,
      iat: issuedAt,
      exp: expiresAt,
      iss: "go-irl-supabase-edge",
      go_irl_user_key: claims.go_irl_user_key,
      go_irl_auth_provider: "google",
      go_irl_role: "professional",
    }, jwtSecret);

    return json({
      status: "accepted",
      requestId: claim.request_id,
      profile: {
        id: claim.profile_id,
        slug: claim.slug,
        publicationState: "draft",
      },
      session: {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: sessionTtlSeconds,
        expires_at: expiresAt,
      },
      user: {
        id: claims.sub,
        userKey: claims.go_irl_user_key,
        provider: "google",
        role: "professional",
      },
    });
  } catch (error) {
    console.error("claim_beauty_master_onboarding_failed", error instanceof Error ? error.name : "unknown_error");
    return json({ error: "claim_failed" }, 500);
  }
});
