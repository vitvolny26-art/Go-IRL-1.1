import { MemoryStorage, tl } from "jsr:@mtcute/core@0.32.2";
import { TelegramClient } from "jsr:@mtcute/deno@0.32.2";
import { activityCleanupTarget, deleteActivityPublication, type CleanupActivity } from "./activity-mtproto-delete-core.ts";

const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("activity_cleanup_missing_configuration");
  return value;
};

let cleanupStage = "configuration";

async function run() {
  const activityId = env("TARGET_EVENT_ID").toLowerCase();
  const messageId = Number(env("TARGET_MESSAGE_ID"));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(activityId)
    || !Number.isSafeInteger(messageId) || messageId <= 0) throw new Error("activity_cleanup_invalid_request");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const url = new URL("/rest/v1/activities", env("SUPABASE_URL"));
  url.searchParams.set("id", `eq.${activityId}`);
  url.searchParams.set("select", "id,city_id,updated_at,metadata");
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
  cleanupStage = "activity_lookup";
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("activity_cleanup_lookup_failed");
  const rows = await response.json() as CleanupActivity[];
  if (rows.length !== 1) throw new Error("activity_cleanup_target_not_unique");
  const activity = rows[0];
  const now = Date.now();
  cleanupStage = "target_validation";
  const target = activityCleanupTarget(activity, activityId, messageId, now);
  const apiId = Number(env("TELEGRAM_API_ID"));
  if (!Number.isSafeInteger(apiId) || apiId <= 0) throw new Error("activity_cleanup_invalid_configuration");
  const telegram = new TelegramClient({ apiId, apiHash: env("TELEGRAM_API_HASH"), storage: new MemoryStorage(), disableUpdates: true });
  let primaryFailure = false;
  let shutdownFailed = false;
  let shutdownError: unknown;
  try {
    cleanupStage = "telegram_authorization";
    await telegram.start({ botToken: env("TELEGRAM_BOT_TOKEN") });
    cleanupStage = "chat_resolution";
    const chat = await telegram.getChat(target.username);
    if (chat.id !== target.chatId) throw new Error("activity_cleanup_chat_mismatch");
    const result = await deleteActivityPublication({ activity, activityId, messageId, now,
      readMessage: async () => { cleanupStage = "message_read"; return (await telegram.getMessages(chat.id, [messageId]))[0] ?? null; },
      deleteMessage: async () => { cleanupStage = "message_delete"; await telegram.deleteMessagesById(chat.id, [messageId]); },
      reconcile: async (metadata, deletedAt) => {
        cleanupStage = "metadata_reconciliation";
        url.searchParams.set("updated_at", `eq.${activity.updated_at}`);
        url.searchParams.set("metadata->cityTelegramPublication->>messageId", `eq.${messageId}`);
        const saved = await fetch(url, { method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify({ metadata, updated_at: deletedAt }) });
        if (!saved.ok) throw new Error("activity_cleanup_reconcile_failed");
        const updated = await saved.json() as CleanupActivity[];
        const state = updated[0]?.metadata?.cityTelegramPublication as Record<string, unknown> | undefined;
        if (updated.length !== 1 || state?.deletedAt !== deletedAt || state.active !== false) throw new Error("activity_cleanup_reconcile_unconfirmed");
      },
    });
    console.warn(`cleanup_result=ok activity_id=${activityId} message_id=${messageId} chat_id=${result.chatId} state=${result.state}`);
  } catch (error) {
    primaryFailure = true;
    throw error;
  } finally {
    // A teardown error must not replace the deletion/readback failure.
    try { await telegram.destroy(); } catch (error) {
      if (!primaryFailure) {
        shutdownFailed = true;
        shutdownError = error;
      } else {
        console.error("cleanup_teardown=failed");
      }
    }
  }
  if (shutdownFailed) {
    cleanupStage = "telegram_shutdown";
    throw shutdownError;
  }
}

try { await run(); } catch (error) {
  // Do not print provider exceptions or configuration values from the protected environment.
  const code = error instanceof Error && /^activity_cleanup_[a-z_]+$/.test(error.message)
    ? error.message : "activity_cleanup_failed";
  // Emit only fixed, known RPC labels; never the provider message or error object.
  const rpcCodes = ["CHAT_ADMIN_REQUIRED", "MESSAGE_DELETE_FORBIDDEN", "CHANNEL_PRIVATE",
    "CHANNEL_INVALID", "MSG_ID_INVALID", "FROZEN_METHOD_INVALID", "BOT_METHOD_INVALID",
    "FLOOD_WAIT_%d"] as const;
  // The Deno adapter can resolve a different core patch version: constructor
  // identity alone does not recognize that copy's RpcError. Read its structured
  // fields, but emit only a literal label from our fixed allowlist.
  const rpcShape = error instanceof Error && "code" in error && "text" in error
    && typeof error.code === "number" && Number.isSafeInteger(error.code)
    && typeof error.text === "string";
  const rpcCode = rpcCodes.find((candidate) => tl.RpcError.is(error, candidate)
    || (rpcShape && error.text === candidate)) ?? "UNCLASSIFIED";
  const errorTypes = ["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError",
    "MtArgumentError", "MtSecurityError", "MtUnsupportedError", "MtTypeAssertionError",
    "MtTimeoutError", "MtPeerNotFoundError", "MtInvalidPeerTypeError", "ConnectionClosedError"] as const;
  const errorType = tl.RpcError.is(error) || rpcShape ? "RPC_ERROR"
    : errorTypes.find((candidate) => error instanceof Error && error.name === candidate) ?? "UNCLASSIFIED";
  // Only known filenames and numeric locations may leave a provider stack.
  const origin = error instanceof Error
    ? error.stack?.match(/\/(delete-messages|resolve-peer|client|base|activity-mtproto-delete|connection|utils)\.(?:ts|js):(\d{1,6}):(\d{1,6})\b/)
    : undefined;
  const errorOrigin = origin ? `${origin[1]}:${origin[2]}:${origin[3]}` : "UNCLASSIFIED";
  console.error(`cleanup_stage=${cleanupStage} cleanup_error=${code} telegram_rpc=${rpcCode} error_type=${errorType} error_origin=${errorOrigin}`);
  Deno.exit(1);
}
