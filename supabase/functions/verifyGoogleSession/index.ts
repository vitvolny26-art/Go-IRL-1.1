import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { hashProviderIdentitySubject } from "../_shared/deletedProviderIdentity.ts";
import { readProviderDisplayMetadata } from "../_shared/providerDisplayMetadata.ts";
import { readProviderSubject } from "../_shared/providerIdentity.ts";

type AppUserRow = {
  id: string;
  user_key: string;
};

type ProviderIdentityRow = {
  user_key: string;
  status: "active" | "revoked";
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

const readBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() || "";
  return token || null;
};

const base64Url = (input: Uint8Array | string) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const accessToken = readBearerToken(request);
    if (!accessToken) return json({ error: "access_denied" }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const jwtSecret = requiredEnv("GO_IRL_JWT_SECRET");
    const sessionTtlSeconds = Number(Deno.env.get("GO_IRL_SESSION_TTL_SECONDS") || 3600);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authResult = await supabase.auth.getUser(accessToken);
    if (authResult.error || !authResult.data.user) return json({ error: "access_denied" }, 401);

    const authUser = authResult.data.user;
    const providerUserId = readProviderSubject(authUser.identities, "google");
    const displayMetadata = readProviderDisplayMetadata(authUser, "google");
    if (!providerUserId) return json({ error: "google_identity_required" }, 403);

    const identityResult = await supabase
      .from("user_provider_identities")
      .select("user_key,status")
      .eq("provider", "google")
      .eq("provider_user_id", providerUserId)
      .maybeSingle();
    if (identityResult.error) throw identityResult.error;
    const linkedIdentity = identityResult.data as ProviderIdentityRow | null;

    const deletedSubjectHash = await hashProviderIdentitySubject("google", providerUserId);
    const deletedIdentityResult = await supabase.from("deleted_provider_identities")
      .select("subject_hash")
      .eq("provider", "google")
      .eq("subject_hash", deletedSubjectHash)
      .maybeSingle();
    if (deletedIdentityResult.error) throw deletedIdentityResult.error;
    if (deletedIdentityResult.data && linkedIdentity?.status !== "active") {
      return json({ error: "account_deleted" }, 410);
    }

    const nowIso = new Date().toISOString();
    let appUser: AppUserRow;

    if (linkedIdentity?.user_key) {
      const appUserResult = await supabase
        .from("app_users")
        .update({ last_login_at: nowIso })
        .eq("user_key", linkedIdentity.user_key)
        .select("id,user_key")
        .single();
      if (appUserResult.error || !appUserResult.data) {
        throw appUserResult.error || new Error("Provider identity points to a missing app user");
      }
      appUser = appUserResult.data as AppUserRow;
    } else {
      const userKey = `user:${crypto.randomUUID()}`;
      const created = await supabase.from("app_users").insert({
        auth_provider: "google",
        provider_user_id: providerUserId,
        user_key: userKey,
        telegram_id: null,
        last_login_at: nowIso,
      })
        .select("id,user_key")
        .maybeSingle();
      if (created.error && created.error.code !== "23505") throw created.error;

      if (created.data) {
        appUser = created.data as AppUserRow;
      } else {
        const raced = await supabase.from("app_users")
          .update({ last_login_at: nowIso })
          .eq("auth_provider", "google")
          .eq("provider_user_id", providerUserId)
          .select("id,user_key")
          .single();
        if (raced.error || !raced.data) throw raced.error || new Error("Google app user bootstrap race failed");
        appUser = raced.data as AppUserRow;
      }

      const identityInsert = await supabase.from("user_provider_identities").insert({
        user_key: appUser.user_key,
        provider: "google",
        provider_user_id: providerUserId,
        status: "active",
      });
      if (identityInsert.error && identityInsert.error.code !== "23505") throw identityInsert.error;
    }

    const identityMetadataPatch: Record<string, string> = {};
    if (displayMetadata.providerEmail) identityMetadataPatch.provider_email = displayMetadata.providerEmail;
    if (displayMetadata.providerDisplayName) identityMetadataPatch.provider_display_name = displayMetadata.providerDisplayName;
    if (Object.keys(identityMetadataPatch).length > 0) {
      const metadataResult = await supabase.from("user_provider_identities")
        .update({ ...identityMetadataPatch, updated_at: nowIso })
        .eq("user_key", appUser.user_key)
        .eq("provider", "google")
        .eq("provider_user_id", providerUserId);
      if (metadataResult.error) throw metadataResult.error;
    }

    const roleResult = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_key", appUser.user_key)
      .maybeSingle();
    if (roleResult.error) throw roleResult.error;

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + sessionTtlSeconds;
    const role = (roleResult.data as { role?: string } | null)?.role || "user";
    const token = await signJwt({
      aud: "authenticated",
      role: "authenticated",
      sub: appUser.id,
      iat: now,
      exp: expiresAt,
      iss: "go-irl-supabase-edge",
      go_irl_user_key: appUser.user_key,
      go_irl_auth_provider: "google",
      go_irl_role: role,
    }, jwtSecret);

    return json({
      session: {
        access_token: token,
        token_type: "bearer",
        expires_in: sessionTtlSeconds,
        expires_at: expiresAt,
      },
      user: {
        id: appUser.id,
        userKey: appUser.user_key,
        provider: "google",
        role,
      },
    });
  } catch (error) {
    console.error("verify_google_session_failed", error instanceof Error ? error.name : "unknown_error");
    return json({ error: "verification_failed" }, 500);
  }
});
