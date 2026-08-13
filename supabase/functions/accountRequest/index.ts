import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { hashProviderIdentitySubject, type DeletedIdentityProvider } from "../_shared/deletedProviderIdentity.ts";
import { readProviderSubject, type WebIdentityProvider } from "../_shared/providerIdentity.ts";

type GoIrlClaims = {
  aud?: string;
  exp?: number;
  iss?: string;
  role?: string;
  sub?: string;
  go_irl_user_key?: string;
};

type ProviderIdentity = {
  provider: string;
  provider_user_id: string;
};

type ProviderSubject = {
  provider: DeletedIdentityProvider;
  subject: string;
};

type AuthCleanup = {
  provider: WebIdentityProvider;
  auth_user_id: string;
};

class AccountRequestError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "AccountRequestError";
  }
}

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
const hasControlCharacter = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
};
const validCorrelationId = (value: string) => value.length >= 8 && value.length <= 160 && !hasControlCharacter(value);
const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const isDeletedProvider = (value: string): value is DeletedIdentityProvider =>
  value === "telegram" || value === "google" || value === "facebook";
const isWebProvider = (value: string): value is WebIdentityProvider => value === "google" || value === "facebook";

const uniqueProviderSubjects = (items: ProviderSubject[]) => {
  const seen = new Set<string>();
  return items.filter(({ provider, subject }) => {
    const key = `${provider}:${subject}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

async function resolveSupabaseAuthUsers(
  supabase: ReturnType<typeof createClient>,
  subjects: ProviderSubject[],
): Promise<AuthCleanup[]> {
  const webSubjects = new Map<WebIdentityProvider, Set<string>>();
  for (const subject of subjects) {
    if (!isWebProvider(subject.provider)) continue;
    const values = webSubjects.get(subject.provider) || new Set<string>();
    values.add(subject.subject);
    webSubjects.set(subject.provider, values);
  }
  if (webSubjects.size === 0) return [];

  const expectedSubjects = [...webSubjects.values()].reduce((total, values) => total + values.size, 0);
  const matchedSubjects = new Set<string>();
  const cleanupByAuthUser = new Map<string, AuthCleanup>();
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const listed = await supabase.auth.admin.listUsers({ page, perPage });
    if (listed.error) throw new AccountRequestError("account_deletion_auth_resolution_failed", 500);
    const users = listed.data.users || [];
    for (const authUser of users) {
      for (const provider of ["google", "facebook"] as const) {
        const wanted = webSubjects.get(provider);
        if (!wanted?.size) continue;
        const providerSubject = readProviderSubject(authUser.identities, provider);
        if (!providerSubject || !wanted.has(providerSubject)) continue;
        matchedSubjects.add(`${provider}:${providerSubject}`);
        if (!cleanupByAuthUser.has(authUser.id)) {
          cleanupByAuthUser.set(authUser.id, { provider, auth_user_id: authUser.id });
        }
      }
    }
    if (matchedSubjects.size >= expectedSubjects) break;
    if (users.length < perPage) break;
    if (page === 20) throw new AccountRequestError("account_deletion_auth_resolution_failed", 500);
  }

  if (matchedSubjects.size !== expectedSubjects) {
    throw new AccountRequestError("account_deletion_auth_resolution_failed", 500);
  }
  return [...cleanupByAuthUser.values()];
}

async function listAvatarPaths(supabase: ReturnType<typeof createClient>, userKey: string) {
  const paths: string[] = [];
  const limit = 100;
  for (let offset = 0; offset < 1000; offset += limit) {
    const listed = await supabase.storage.from("avatars").list(userKey, { limit, offset });
    if (listed.error) throw listed.error;
    const items = listed.data || [];
    for (const item of items) {
      if (item.name) paths.push(`${userKey}/${item.name}`);
    }
    if (items.length < limit) break;
    if (offset === 900) throw new Error("avatar_cleanup_limit");
  }
  return paths;
}

async function finalizeCleanup(
  supabase: ReturnType<typeof createClient>,
  receiptId: string,
  authCleanup: AuthCleanup[],
  avatarPaths: string[],
) {
  let authPending = 0;
  for (const item of authCleanup) {
    const deletion = await supabase.auth.admin.deleteUser(item.auth_user_id, false);
    if (deletion.error) {
      authPending += 1;
      console.error("account_delete_auth_cleanup_pending", item.provider);
      continue;
    }
    const removed = await supabase.from("account_deletion_auth_cleanup")
      .delete()
      .eq("receipt_id", receiptId)
      .eq("auth_user_id", item.auth_user_id);
    if (removed.error) throw removed.error;
  }

  let storagePending = 0;
  if (avatarPaths.length > 0) {
    const removed = await supabase.storage.from("avatars").remove(avatarPaths);
    if (removed.error) {
      storagePending = avatarPaths.length;
      console.error("account_delete_storage_cleanup_pending", removed.error.name);
    } else {
      const cleared = await supabase.from("account_deletion_storage_cleanup")
        .delete()
        .eq("receipt_id", receiptId);
      if (cleared.error) throw cleared.error;
    }
  }

  const status = authPending === 0 && storagePending === 0 ? "completed" : "cleanup_pending";
  const updated = await supabase.from("account_deletion_receipts")
    .update({
      status,
      auth_cleanup_pending: authPending,
      storage_cleanup_pending: storagePending,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", receiptId);
  if (updated.error) throw updated.error;

  return { authPending, storagePending, status };
}

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
    const deletionCorrelationHash = kind === "account_deletion"
      ? await sha256Hex(`${claims.go_irl_user_key}:${correlationId}`)
      : null;
    if (deletionCorrelationHash) {
      const previousReceipt = await supabase.from("account_deletion_receipts")
        .select("id,status")
        .eq("correlation_hash", deletionCorrelationHash)
        .maybeSingle<{ id: string; status: string }>();
      if (previousReceipt.error) throw previousReceipt.error;
      if (previousReceipt.data) {
        return json({
          request: { id: previousReceipt.data.id, kind, status: previousReceipt.data.status, correlation_id: correlationId },
          duplicate: true,
          accountDeleted: true,
          cleanupPending: previousReceipt.data.status !== "completed",
        }, 200);
      }
    }

    const appUserResult = await supabase.from("app_users")
      .select("id,user_key,status,auth_provider,provider_user_id")
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
      if (kind !== "account_deletion") return json({ request: existingResult.data, duplicate: true }, 200);
    } else if (insertResult.error || !insertResult.data) {
      throw insertResult.error || new Error("account_request_insert_failed");
    }

    if (kind !== "account_deletion") {
      return json({ request: insertResult.data, duplicate: false }, 202);
    }

    const identitiesResult = await supabase.from("user_provider_identities")
      .select("provider,provider_user_id")
      .eq("user_key", claims.go_irl_user_key);
    if (identitiesResult.error) throw identitiesResult.error;

    const subjects = uniqueProviderSubjects([
      ...(isDeletedProvider(appUserResult.data.auth_provider) && appUserResult.data.provider_user_id
        ? [{ provider: appUserResult.data.auth_provider, subject: appUserResult.data.provider_user_id }]
        : []),
      ...((identitiesResult.data || []) as ProviderIdentity[])
        .filter((identity) => isDeletedProvider(identity.provider) && Boolean(identity.provider_user_id))
        .map((identity) => ({ provider: identity.provider as DeletedIdentityProvider, subject: identity.provider_user_id })),
    ]);
    if (subjects.length === 0) throw new Error("account_delete_identity_missing");

    const providerTombstones = await Promise.all(subjects.map(async ({ provider, subject }) => ({
      provider,
      subject_hash: await hashProviderIdentitySubject(provider, subject),
    })));
    const authCleanup = await resolveSupabaseAuthUsers(supabase, subjects);
    const avatarPaths = await listAvatarPaths(supabase, claims.go_irl_user_key);
    const receiptId = crypto.randomUUID();

    const scrub = await supabase.rpc("go_irl_self_delete_account", {
      p_user_key: claims.go_irl_user_key,
      p_receipt_id: receiptId,
      p_correlation_hash: deletionCorrelationHash,
      p_provider_tombstones: providerTombstones,
      p_auth_cleanup: authCleanup,
      p_storage_cleanup: avatarPaths.map((objectPath) => ({ bucket_id: "avatars", object_path: objectPath })),
    }).single<{ status: string; receipt_id: string }>();
    if (scrub.error) {
      if (scrub.error.message?.includes("account_deletion_owner_obligations")) {
        return json({ error: "account_deletion_owner_obligations" }, 409);
      }
      throw scrub.error;
    }
    if (!scrub.data || scrub.data.status !== "scrubbed" || scrub.data.receipt_id !== receiptId) {
      throw new Error("account_delete_scrub_invalid_response");
    }

    const cleanup = await finalizeCleanup(supabase, receiptId, authCleanup, avatarPaths);
    return json({
      request: { id: receiptId, kind, status: cleanup.status, correlation_id: correlationId, created_at: new Date().toISOString() },
      duplicate: false,
      accountDeleted: true,
      cleanupPending: cleanup.status !== "completed",
    }, 202);
  } catch (error) {
    if (error instanceof AccountRequestError) {
      console.error("account_request_failed", error.code);
      return json({ error: error.code }, error.status);
    }
    console.error("account_request_failed", error instanceof Error ? error.name : "unknown_error");
    return json({ error: "request_failed" }, 500);
  }
});
