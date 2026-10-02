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
  } finally { await telegram.destroy(); }
}

try { await run(); } catch (error) {
  // Do not print provider exceptions or configuration values from the protected environment.
  const code = error instanceof Error && /^activity_cleanup_[a-z_]+$/.test(error.message)
    ? error.message : "activity_cleanup_failed";
  // Emit only fixed, known RPC labels; never the provider message or error object.
  const rpcCodes = ["CHAT_ADMIN_REQUIRED", "MESSAGE_DELETE_FORBIDDEN", "CHANNEL_PRIVATE",
    "CHANNEL_INVALID", "MSG_ID_INVALID", "FROZEN_METHOD_INVALID", "BOT_METHOD_INVALID",
    "FLOOD_WAIT_%d"] as const;
  const rpcCode = rpcCodes.find((candidate) => tl.RpcError.is(error, candidate)) ?? "UNCLASSIFIED";
  console.error(`cleanup_stage=${cleanupStage} cleanup_error=${code} telegram_rpc=${rpcCode}`);
  Deno.exit(1);
}
