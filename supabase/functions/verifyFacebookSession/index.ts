import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { readProviderSubject } from "../_shared/providerIdentity.ts";

type AppUserRow = {
  id: string;
  user_key: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
});

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const base64Url = (input: Uint8Array | string) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

async function signJwt(payload: Record<string, unknown>, secret: string) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const data = `${header}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return `${data}.${base64Url(signature)}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authorization = request.headers.get("authorization") || "";
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
    if (!accessToken) return json({ error: "access_denied" }, 401);

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authResult = await supabase.auth.getUser(accessToken);
    if (authResult.error || !authResult.data.user) return json({ error: "access_denied" }, 401);

    const providerUserId = readProviderSubject(authResult.data.user.identities, "facebook");
    if (!providerUserId) return json({ error: "facebook_identity_required" }, 403);

    const identityResult = await supabase.from("user_provider_identities")
      .select("user_key")
      .eq("provider", "facebook")
      .eq("provider_user_id", providerUserId)
      .maybeSingle<{ user_key: string }>();
    if (identityResult.error) throw identityResult.error;

    const nowIso = new Date().toISOString();
    let appUser: AppUserRow;

    if (identityResult.data?.user_key) {
      const existing = await supabase.from("app_users")
        .update({ last_login_at: nowIso })
        .eq("user_key", identityResult.data.user_key)
        .select("id,user_key")
        .single<AppUserRow>();
      if (existing.error || !existing.data) throw existing.error || new Error("Provider identity points to missing app user");
      appUser = existing.data;
    } else {
      const userKey = `user:${crypto.randomUUID()}`;
      const created = await supabase.from("app_users").insert({
        auth_provider: "facebook",
        provider_user_id: providerUserId,
        user_key: userKey,
        telegram_id: null,
        last_login_at: nowIso,
      })
        .select("id,user_key")
        .maybeSingle<AppUserRow>();
      if (created.error && created.error.code !== "23505") throw created.error;

      if (created.data) {
        appUser = created.data;
      } else {
        const raced = await supabase.from("app_users")
          .update({ last_login_at: nowIso })
          .eq("auth_provider", "facebook")
          .eq("provider_user_id", providerUserId)
          .select("id,user_key")
          .single<AppUserRow>();
        if (raced.error || !raced.data) throw raced.error || new Error("Facebook app user bootstrap race failed");
        appUser = raced.data;
      }

      const identityInsert = await supabase.from("user_provider_identities").insert({
        user_key: appUser.user_key,
        provider: "facebook",
        provider_user_id: providerUserId,
        status: "active",
      });
      if (identityInsert.error && identityInsert.error.code !== "23505") throw identityInsert.error;
    }

    const roleResult = await supabase.from("user_roles")
      .select("role")
      .eq("user_key", appUser.user_key)
      .maybeSingle<{ role: string }>();
    if (roleResult.error) throw roleResult.error;

    const now = Math.floor(Date.now() / 1000);
    const ttl = Number(Deno.env.get("GO_IRL_SESSION_TTL_SECONDS") || 3600);
    const expiresAt = now + ttl;
    const role = roleResult.data?.role || "user";
    const token = await signJwt({
      aud: "authenticated",
      role: "authenticated",
      sub: appUser.id,
      iat: now,
      exp: expiresAt,
      iss: "go-irl-supabase-edge",
      go_irl_user_key: appUser.user_key,
      go_irl_auth_provider: "facebook",
      go_irl_role: role,
    }, requiredEnv("GO_IRL_JWT_SECRET"));

    return json({
      session: { access_token: token, token_type: "bearer", expires_in: ttl, expires_at: expiresAt },
      user: {
        id: appUser.id,
        userKey: appUser.user_key,
        provider: "facebook",
        role,
      },
    });
  } catch (error) {
    console.error("verify_facebook_session_failed", error instanceof Error ? error.name : "unknown_error");
    return json({ error: "verification_failed" }, 500);
  }
});
