import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  createTelegramReplayKey,
  TelegramInitDataValidationError,
  validateTelegramInitData,
} from "../_shared/telegramInitData.ts";
import {
  createRoleInvitationToken,
  hashRoleInvitationToken,
  isRoleInvitationTargetRole,
  parseRoleInvitationStartParam,
  roleInvitationLifetimeSeconds,
  type RoleInvitationRedemptionStatus,
  type RoleInvitationTargetRole,
} from "../_shared/roleInvitations.ts";

type AppUserRow = {
  id: string;
  user_key: string;
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
};

type RoleInvitationCreateRow = { id: string; expires_at: string };
type RoleInvitationRedeemRow = { status: RoleInvitationRedemptionStatus; target_role: RoleInvitationTargetRole | null };
type RoleAssignmentRow = {
  user_key: string;
  telegram_id: number | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  role: string;
  updated_at: string;
};
type RoleDemotionRow = {
  status: "updated" | "invalid" | "not_found" | "role_conflict";
  previous_role: string | null;
  current_role: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
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
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
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
    const {
      action = "session",
      initData,
      targetRole,
      targetUserKey,
    } = await request.json() as {
      action?: "session" | "create_role_invitation" | "list_role_assignments" | "demote_role";
      initData?: string;
      targetRole?: string;
      targetUserKey?: string;
    };

    if (!initData) return json({ error: "init_data_required" }, 400);
    if (!["session", "create_role_invitation", "list_role_assignments", "demote_role"].includes(action)) {
      return json({ error: "invalid_action" }, 400);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const telegramBotToken = requiredEnv("TELEGRAM_BOT_TOKEN");
    const jwtSecret = requiredEnv("GO_IRL_JWT_SECRET");
    const authMaxAgeSeconds = Number(Deno.env.get("GO_IRL_AUTH_MAX_AGE_SECONDS") || 86400);
    const sessionTtlSeconds = Number(Deno.env.get("GO_IRL_SESSION_TTL_SECONDS") || 3600);

    const verified = await validateTelegramInitData({
      initData,
      botToken: telegramBotToken,
      maxAgeSeconds: authMaxAgeSeconds,
    });

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const replayHash = await createTelegramReplayKey(verified.hash);
    const replayResult = await supabase.from("telegram_auth_replay").insert({
      init_data_hash: replayHash,
      telegram_id: verified.user.id,
      auth_date: new Date(verified.authDate * 1000).toISOString(),
      expires_at: new Date((verified.authDate + authMaxAgeSeconds) * 1000).toISOString(),
    });
    if (replayResult.error && replayResult.error.code !== "23505") throw replayResult.error;

    const userKey = `telegram:${verified.user.id}`;
    const upsertResult = await supabase.from("app_users").upsert({
      auth_provider: "telegram",
      provider_user_id: String(verified.user.id),
      user_key: userKey,
      telegram_id: verified.user.id,
      first_name: verified.user.first_name || null,
      last_name: verified.user.last_name || null,
      username: verified.user.username?.toLowerCase() || null,
      language_code: verified.user.language_code || null,
      last_login_at: new Date().toISOString(),
    }, { onConflict: "auth_provider,provider_user_id" })
      .select("id,user_key,telegram_id,first_name,last_name,username")
      .single<AppUserRow>();
    if (upsertResult.error || !upsertResult.data) throw upsertResult.error || new Error("User upsert failed");

    const identityResult = await supabase.from("user_provider_identities").upsert({
      user_key: userKey,
      provider: "telegram",
      provider_user_id: String(verified.user.id),
      status: "active",
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider,provider_user_id" });
    if (identityResult.error) throw identityResult.error;

    const roleBeforeAction = await supabase.from("user_roles").select("role").eq("user_key", userKey).maybeSingle<{ role: string }>();
    if (roleBeforeAction.error) throw roleBeforeAction.error;
    const actorRole = roleBeforeAction.data?.role || "user";
    const actorIsAdminClass = actorRole === "admin" || actorRole === "superadmin";

    if (action === "create_role_invitation") {
      if (!actorIsAdminClass) return json({ error: "access_denied" }, 403);
      if (!isRoleInvitationTargetRole(targetRole)) return json({ error: "invalid_target_role" }, 400);
      if (targetRole === "admin" && actorRole !== "superadmin") return json({ error: "access_denied" }, 403);
      const token = createRoleInvitationToken();
      const tokenHash = await hashRoleInvitationToken(token);
      const expiresAt = new Date(Date.now() + roleInvitationLifetimeSeconds * 1000).toISOString();
      const invitationResult = await supabase.rpc("go_irl_create_role_invitation", {
        p_token_hash: tokenHash,
        p_target_role: targetRole,
        p_created_by_user_key: userKey,
        p_expires_at: expiresAt,
      }).single<RoleInvitationCreateRow>();
      if (invitationResult.error || !invitationResult.data) throw invitationResult.error || new Error("Role invitation creation failed");
      return json({ invitation: {
        id: invitationResult.data.id,
        startParam: token,
        targetRole,
        expiresAt: invitationResult.data.expires_at,
      } }, 201);
    }

    if (action === "list_role_assignments") {
      if (!actorIsAdminClass) return json({ error: "access_denied" }, 403);
      const listResult = await supabase.rpc("go_irl_list_elevated_roles");
      if (listResult.error) throw listResult.error;
      return json({ roleAssignments: (listResult.data || []) as RoleAssignmentRow[] });
    }

    if (action === "demote_role") {
      if (!actorIsAdminClass) return json({ error: "access_denied" }, 403);
      const normalizedTargetUserKey = typeof targetUserKey === "string" ? targetUserKey.trim() : "";
      if (!/^telegram:[0-9]+$/.test(normalizedTargetUserKey)) return json({ error: "invalid_target_user_key" }, 400);
      const demotionResult = await supabase.rpc("go_irl_demote_role", {
        p_target_user_key: normalizedTargetUserKey,
        p_actor_user_key: userKey,
      }).single<RoleDemotionRow>();
      if (demotionResult.error || !demotionResult.data) throw demotionResult.error || new Error("Role demotion failed");
      const statusCode = demotionResult.data.status === "updated" ? 200 : 409;
      return json({ roleDemotion: demotionResult.data }, statusCode);
    }

    const roleInvitationToken = parseRoleInvitationStartParam(verified.startParam);
    let roleInvitation: RoleInvitationRedeemRow | null = null;
    if (roleInvitationToken) {
      const tokenHash = await hashRoleInvitationToken(roleInvitationToken);
      const redemptionResult = await supabase.rpc("go_irl_redeem_role_invitation", {
        p_token_hash: tokenHash,
        p_user_key: userKey,
      }).single<RoleInvitationRedeemRow>();
      if (redemptionResult.error || !redemptionResult.data) throw redemptionResult.error || new Error("Role invitation redemption failed");
      roleInvitation = redemptionResult.data;
    }

    const roleResult = roleInvitation
      ? await supabase.from("user_roles").select("role").eq("user_key", userKey).maybeSingle<{ role: string }>()
      : roleBeforeAction;
    if (roleResult.error) throw roleResult.error;

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + sessionTtlSeconds;
    const token = await signJwt({
      aud: "authenticated",
      role: "authenticated",
      sub: upsertResult.data.id,
      iat: now,
      exp: expiresAt,
      iss: "go-irl-supabase-edge",
      go_irl_user_key: userKey,
      go_irl_telegram_id: verified.user.id,
      go_irl_start_param: roleInvitationToken ? null : verified.startParam || null,
      go_irl_role: roleResult.data?.role || "user",
    }, jwtSecret);

    return json({
      session: { access_token: token, token_type: "bearer", expires_in: sessionTtlSeconds, expires_at: expiresAt },
      user: {
        id: upsertResult.data.id,
        userKey,
        telegramId: upsertResult.data.telegram_id,
        firstName: upsertResult.data.first_name,
        lastName: upsertResult.data.last_name,
        username: upsertResult.data.username,
        role: roleResult.data?.role || "user",
      },
      startParam: roleInvitationToken ? undefined : verified.startParam,
      roleInvitation,
    });
  } catch (error) {
    console.error(error);
    if (error instanceof TelegramInitDataValidationError) return json({ error: error.code }, 401);
    return json({ error: "verification_failed" }, 500);
  }
});
