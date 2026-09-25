import { MemoryStorage } from "jsr:@mtcute/core@0.32.2";
import { TelegramClient } from "jsr:@mtcute/deno@0.32.2";
import {
  resolveCityTelegramChatId,
  resolveCityTelegramUsername,
} from "../api/_shared/telegram-city-publication-core.ts";

type TerminalPublication = {
  event_id: string;
  city_id: string;
  telegram_chat_id: number;
  telegram_message_id: number;
  expires_at: string;
  deleted_at: string | null;
  last_error: string | null;
};

const terminalPrefix = "terminal_telegram_delete:";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`afishi008_missing_env:${name}`);
  return value;
};

const boundedInteger = (name: string, raw: string) => {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`afishi008_invalid_integer:${name}`);
  return value;
};

const supabaseUrl = requiredEnv("SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const telegramApiId = boundedInteger("TELEGRAM_API_ID", requiredEnv("TELEGRAM_API_ID"));
const telegramApiHash = requiredEnv("TELEGRAM_API_HASH");
const telegramBotToken = requiredEnv("TELEGRAM_BOT_TOKEN");
const eventId = requiredEnv("TARGET_EVENT_ID").toLowerCase();
const expectedMessageId = boundedInteger("TARGET_MESSAGE_ID", requiredEnv("TARGET_MESSAGE_ID"));

if (!uuidPattern.test(eventId)) throw new Error("afishi008_invalid_event_id");

const restHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

const publicationUrl = new URL("/rest/v1/city_posters_telegram_publications", supabaseUrl);
publicationUrl.searchParams.set(
  "select",
  "event_id,city_id,telegram_chat_id,telegram_message_id,expires_at,deleted_at,last_error",
);
publicationUrl.searchParams.set("event_id", `eq.${eventId}`);

const publicationResponse = await fetch(publicationUrl, { headers: restHeaders });
if (!publicationResponse.ok) {
  throw new Error(`afishi008_publication_lookup_failed:${publicationResponse.status}`);
}
const publications = await publicationResponse.json() as TerminalPublication[];
if (publications.length !== 1) throw new Error("afishi008_publication_target_not_unique");

const publication = publications[0];
if (publication.deleted_at !== null) throw new Error("afishi008_publication_already_ledger_deleted");
if (publication.telegram_message_id !== expectedMessageId) throw new Error("afishi008_publication_message_changed");
if (!publication.last_error?.startsWith(terminalPrefix)) throw new Error("afishi008_publication_not_terminal");
const expiresAtMs = Date.parse(publication.expires_at);
if (!Number.isFinite(expiresAtMs) || expiresAtMs > Date.now()) throw new Error("afishi008_publication_not_expired");

const expectedChatId = resolveCityTelegramChatId(publication.city_id);
const chatUsername = resolveCityTelegramUsername(publication.city_id);
if (!expectedChatId || !chatUsername || publication.telegram_chat_id !== expectedChatId) {
  throw new Error("afishi008_publication_city_target_mismatch");
}

const telegram = new TelegramClient({
  apiId: telegramApiId,
  apiHash: telegramApiHash,
  storage: new MemoryStorage(),
  disableUpdates: true,
});

try {
  await telegram.start({ botToken: telegramBotToken });

  const chat = await telegram.getChat(chatUsername);
  if (chat.id !== expectedChatId) throw new Error("afishi008_mtproto_chat_identity_mismatch");

  const before = (await telegram.getMessages(chat.id, [expectedMessageId]))[0] ?? null;
  const state = before ? "deleted" : "already_absent";
  if (before) await telegram.deleteMessagesById(chat.id, [expectedMessageId]);

  const after = (await telegram.getMessages(chat.id, [expectedMessageId]))[0] ?? null;
  if (after !== null) throw new Error("afishi008_mtproto_physical_delete_not_confirmed");

  const deletedAt = new Date().toISOString();
  const reconcileUrl = new URL("/rest/v1/city_posters_telegram_publications", supabaseUrl);
  reconcileUrl.searchParams.set("event_id", `eq.${eventId}`);
  reconcileUrl.searchParams.set("telegram_message_id", `eq.${expectedMessageId}`);
  reconcileUrl.searchParams.set("deleted_at", "is.null");
  reconcileUrl.searchParams.set("last_error", `eq.${publication.last_error}`);

  const reconcileResponse = await fetch(reconcileUrl, {
    method: "PATCH",
    headers: { ...restHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ deleted_at: deletedAt, updated_at: deletedAt, last_error: null }),
  });
  if (!reconcileResponse.ok) {
    throw new Error(`afishi008_ledger_reconcile_failed:${reconcileResponse.status}`);
  }
  const reconciled = await reconcileResponse.json() as TerminalPublication[];
  if (reconciled.length !== 1 || reconciled[0]?.deleted_at !== deletedAt) {
    throw new Error("afishi008_ledger_reconcile_not_confirmed");
  }

  console.log(`cleanup_result=ok event_id=${eventId} message_id=${expectedMessageId} state=${state}`);
} finally {
  await telegram.destroy();
}
