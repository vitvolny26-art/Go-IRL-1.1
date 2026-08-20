import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { hashProviderIdentitySubject } from "../_shared/deletedProviderIdentity.ts";
import { readProviderSubject, type WebIdentityProvider } from "../_shared/providerIdentity.ts";

type WebProvider = WebIdentityProvider;
type GoIrlClaims = {
  aud?: string;
  exp?: number;
  iss?: string;
  role?: string;
  sub?: string;
  go_irl_user_key?: string;
};

type JwtVerificationResult =
  | { ok: true; claims: GoIrlClaims }
  | { ok: false };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-provider-access-token, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json",
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

const isWebProvider = (value: unknown): value is WebProvider => value === "google" || value === "facebook";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const goIrlToken = readBearerToken(request);
    if (!goIrlToken) return json({ error: "access_denied" }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const jwtSecret = requiredEnv("GO_IRL_JWT_SECRET");
    const verification = await verifyGoIrlJwt(goIrlToken, jwtSecret);
    if (!verification.ok) return json({ error: "access_denied" }, 401);

    const { claims } = verification;
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.iss !== "go-irl-supabase-edge"
      || claims.aud !== "authenticated"
      || claims.role !== "authenticated"
      || !claims.sub
      || !claims.go_irl_user_key
      || !claims.exp
      || claims.exp <= now
    ) return json({ error: "access_denied" }, 403);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const appUserResult = await supabase
      .from("app_users")
      .select("id,user_key")
      .eq("user_key", claims.go_irl_user_key)
      .maybeSingle();
    if (appUserResult.error) throw appUserResult.error;
    if (!appUserResult.data || appUserResult.data.id !== claims.sub) return json({ error: "access_denied" }, 403);

    if (request.method === "GET") {
      const identitiesResult = await supabase
        .from("user_provider_identities")
        .select("provider,status")
        .eq("user_key", claims.go_irl_user_key)
        .order("provider");
      if (identitiesResult.error) throw identitiesResult.error;
      return json({ identities: identitiesResult.data || [] });
    }

    const body = await request.json() as { provider?: unknown; action?: unknown };
    if (!isWebProvider(body.provider)) return json({ error: "invalid_provider" }, 400);
    const provider = body.provider;
    const action = body.action === undefined ? "link" : body.action;
    if (action !== "link" && action !== "transfer") return json({ error: "invalid_action" }, 400);
    const providerAccessToken = request.headers.get("x-provider-access-token")?.trim() || "";
    if (!providerAccessToken) return json({ error: "provider_session_required" }, 401);

    const candidateResult = await supabase.auth.getUser(providerAccessToken);
    if (candidateResult.error || !candidateResult.data.user) return json({ error: "provider_session_invalid" }, 401);
    const providerUserId = readProviderSubject(candidateResult.data.user.identities, provider);
    if (!providerUserId) return json({ error: "provider_identity_required" }, 403);

    const deletedSubjectHash = await hashProviderIdentitySubject(provider, providerUserId);
    const deletedIdentityResult = await supabase.from("deleted_provider_identities")
      .select("subject_hash")
      .eq("provider", provider)
      .eq("subject_hash", deletedSubjectHash)
      .maybeSingle();
    if (deletedIdentityResult.error) throw deletedIdentityResult.error;
    const canRelinkDeletedGoogle = body.action === "link" && provider === "google";
    if (deletedIdentityResult.data && !canRelinkDeletedGoogle) return json({ error: "account_deleted" }, 410);

    if (action === "transfer") {
      const transferRpc = provider === "google"
        ? "go_irl_transfer_google_identity"
        : "go_irl_transfer_facebook_identity";
      const transferResult = await supabase.rpc(transferRpc, {
        p_target_user_key: claims.go_irl_user_key,
        p_provider_binding_id: providerUserId,
      }).single<{ status: string }>();
      if (transferResult.error || !transferResult.data) {
        throw transferResult.error || new Error("Identity transfer RPC failed");
      }

      if (transferResult.data.status === "transferred") return json({ status: "transferred", provider });
      if (transferResult.data.status === "already_linked") return json({ status: "already_linked", provider });
      if (transferResult.data.status === "transfer_blocked") return json({ error: "identity_transfer_blocked" }, 409);
      if (transferResult.data.status === "target_provider_conflict") return json({ error: "identity_conflict" }, 409);
      if (transferResult.data.status === "identity_missing" || transferResult.data.status === "target_unavailable") {
        return json({ error: "identity_transfer_unavailable" }, 409);
      }
      if (transferResult.data.status === "invalid") return json({ error: "invalid_transfer" }, 400);
      return json({ error: "identity_transfer_failed" }, 500);
    }

    const linkResult = await supabase.rpc("go_irl_link_provider_identity", {
      p_user_key: claims.go_irl_user_key,
      p_provider: provider,
      // Current schema stores the immutable provider subject as the minimal durable binding.
      // It is not returned to the browser, JWT, UI, or audit metadata.
      p_provider_binding_id: providerUserId,
    }).single<{ status: string }>();
    if (linkResult.error || !linkResult.data) throw linkResult.error || new Error("Identity link RPC failed");

    if (linkResult.data.status === "identity_conflict") return json({ error: "identity_conflict" }, 409);
    if (linkResult.data.status === "already_linked") return json({ status: "already_linked", provider });
    if (linkResult.data.status !== "linked") return json({ error: "link_failed" }, 500);
    return json({ status: "linked", provider }, 201);
  } catch (error) {
    console.error("link_provider_identity_failed", error instanceof Error ? error.name : "unknown_error");
    return json({ error: "link_failed" }, 500);
  }
});
