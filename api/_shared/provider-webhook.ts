import { parseMetaMessagingTestPayload } from "../../src/meta-messaging/mock-webhook.js";
import type { MetaMessagingProvider } from "../../src/meta-messaging/types.js";
import { parseWhatsAppTestPayload } from "../../src/whatsapp/mock-webhook.js";
import { enqueueChannelInboundEvent } from "./channel-inbound-queue.js";
import { readEnv, requireEnv } from "./env.js";
import { normalizeProviderInboundEvents } from "./provider-inbound-normalizer.js";
import { verifyMetaSignature } from "./meta-signature.js";
import {
  getProviderEventSummary,
  joinProviderEvent,
  recordProviderInbound,
  setProviderNotificationConsent,
} from "./provider-join-service.js";
import {
  claimProviderInboundEvent,
  completeProviderInboundEvent,
} from "./provider-inbound-service.js";
import {
  sendMessengerWelcome,
  sendProviderInvitation,
  sendProviderJoinResult,
  sendProviderText,
  type MessagingProvider,
} from "./provider-messages.js";

type UnknownRecord = Record<string, unknown>;

type InboundAction = {
  id: string;
  providerUserId: string;
  displayName: string;
  text?: string;
  actionPayload?: string;
};

export type ProviderInboundAction = InboundAction;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null ? value as UnknownRecord : null;

const asRecords = (value: unknown) => Array.isArray(value) ? value.map(asRecord).filter(Boolean) as UnknownRecord[] : [];

export function summarizeMetaWebhookPayload(payload: unknown) {
  const root = asRecord(payload);
  const entries = asRecords(root?.entry);
  const changeFields = new Set<string>();
  let directMessagingEvents = 0;
  let changedValueMessagingEvents = 0;

  for (const entry of entries) {
    directMessagingEvents += asRecords(entry.messaging).length;
    for (const change of asRecords(entry.changes)) {
      if (typeof change.field === "string") changeFields.add(change.field);
      const value = asRecord(change.value);
      changedValueMessagingEvents += asRecords(value?.messaging).length;
    }
  }

  return {
    object: typeof root?.object === "string" ? root.object : "unknown",
    entries: entries.length,
    directMessagingEvents,
    changedValueMessagingEvents,
    changeFields: [...changeFields].sort(),
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stopCommands = new Set(["stop", "стоп", "отписаться", "отписка", "unsubscribe"]);
const startCommands = new Set(["start", "старт", "подписаться", "подписка", "subscribe"]);

export function classifyProviderConsentCommand(text?: string) {
  const normalized = text?.trim().toLocaleLowerCase("ru-RU") || "";
  if (stopCommands.has(normalized)) return "revoke" as const;
  if (startCommands.has(normalized)) return "consent" as const;
  return null;
}

function parseWhatsAppActions(payload: unknown): InboundAction[] {
  const root = asRecord(payload);
  const names = new Map<string, string>();
  for (const entry of asRecords(root?.entry)) {
    for (const change of asRecords(entry.changes)) {
      const value = asRecord(change.value);
      for (const contact of asRecords(value?.contacts)) {
        const profile = asRecord(contact.profile);
        if (typeof contact.wa_id === "string" && typeof profile?.name === "string") names.set(contact.wa_id, profile.name);
      }
    }
  }
  return parseWhatsAppTestPayload(payload).map((message) => ({
    id: message.id,
    providerUserId: message.from,
    displayName: names.get(message.from) || "WhatsApp User",
    text: message.text,
    actionPayload: message.replyId,
  }));
}

function parseMetaActions(provider: MetaMessagingProvider, payload: unknown): InboundAction[] {
  return parseMetaMessagingTestPayload(provider, payload).map((message) => ({
    id: message.id,
    providerUserId: message.senderId,
    displayName: provider === "instagram" ? "Instagram User" : "Messenger User",
    text: message.text,
    actionPayload: message.actionPayload,
  }));
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const providerSecret = (
  provider: MessagingProvider,
  instagramName: string,
  sharedName: string,
) => provider === "instagram"
  ? readEnv(instagramName) || requireEnv(sharedName)
  : requireEnv(sharedName);

export function channelInboundFastIngressEnabled(provider: MessagingProvider) {
  return readEnv("GO_IRL_CHANNEL_INBOUND_FAST_INGRESS_CHANNELS")
    .split(",")
    .map((channel) => channel.trim())
    .filter(Boolean)
    .includes(provider);
}

const safeErrorToken = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);

export function providerProcessingErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "unknown_error";

  const metaStatus = /^meta_send_failed:(\d{3}):/.exec(error.message)?.[1];
  if (metaStatus) return `meta_send_failed_${metaStatus}`;

  const wrappedTransportCode = /^meta_transport_failed:([A-Za-z0-9_-]{1,60})$/.exec(error.message)?.[1];
  if (wrappedTransportCode) {
    return wrappedTransportCode === "unknown"
      ? "meta_transport_failed"
      : `meta_transport_${wrappedTransportCode}`;
  }

  const cause = (error as Error & { cause?: { code?: unknown } }).cause;
  const transportCode = typeof cause?.code === "string" ? safeErrorToken(cause.code) : "";
  if (error.name === "TypeError" && error.message === "fetch failed") {
    return transportCode ? `meta_transport_${transportCode}` : "meta_transport_failed";
  }

  return safeErrorToken(error.name) || "unknown_error";
}

export async function processProviderAction(provider: MessagingProvider, action: InboundAction) {
  const claim = await claimProviderInboundEvent(provider, action.id);
  if (!claim.claimed) return "duplicate" as const;

  try {
    await recordProviderInbound({
      provider,
      providerUserId: action.providerUserId,
      displayName: action.displayName,
    });

    const consentCommand = classifyProviderConsentCommand(action.text);
    if (consentCommand) {
      const consented = consentCommand === "consent";
      await setProviderNotificationConsent({
        provider,
        providerUserId: action.providerUserId,
        displayName: action.displayName,
        consented,
      });
      await sendProviderText(
        provider,
        action.providerUserId,
        consented
          ? "Уведомления GO IRL включены. Чтобы отключить их, отправьте СТОП."
          : "Уведомления GO IRL отключены. Чтобы включить их снова, отправьте СТАРТ.",
      );
    } else if (!action.actionPayload) {
      if (provider === "messenger" && action.text?.trim()) {
        await sendMessengerWelcome(action.providerUserId);
      }
    } else {
      const separator = action.actionPayload.indexOf(":");
      if (separator >= 1) {
        const command = action.actionPayload.slice(0, separator);
        const eventId = action.actionPayload.slice(separator + 1);
        if (uuidPattern.test(eventId)) {
          if (command === "details") {
            const event = await getProviderEventSummary(eventId);
            if (event) await sendProviderInvitation(provider, action.providerUserId, event);
          } else if (command === "join") {
            const result = await joinProviderEvent({
              provider,
              providerUserId: action.providerUserId,
              displayName: action.displayName,
              eventId,
            });
            if (result.status === "already_joined" || result.status === "rejected") {
              await sendProviderJoinResult(provider, action.providerUserId, result);
            }
          }
        }
      }
    }

    await completeProviderInboundEvent({
      provider,
      eventKey: claim.eventKey,
      success: true,
    });
    return "processed" as const;
  } catch (error) {
    const errorCode = providerProcessingErrorCode(error);
    console.warn("provider_action_failed", { provider, errorCode });
    await completeProviderInboundEvent({
      provider,
      eventKey: claim.eventKey,
      success: false,
      errorCode,
    });
    throw error;
  }
}

export async function handleProviderWebhook(provider: MessagingProvider, request: Request) {
  if (request.method === "GET") {
    const query = new URL(request.url, "https://goirl.invalid").searchParams;
    const valid = query.get("hub.mode") === "subscribe"
      && query.get("hub.verify_token") === providerSecret(
        provider,
        "INSTAGRAM_VERIFY_TOKEN",
        "META_VERIFY_TOKEN",
      )
      && Boolean(query.get("hub.challenge"));
    return valid
      ? new Response(query.get("hub.challenge"), { status: 200 })
      : jsonResponse({ error: "verification_failed" }, 403);
  }

  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") || "";
  if (!await verifyMetaSignature(rawBody, signature, providerSecret(
    provider,
    "INSTAGRAM_APP_SECRET",
    "META_APP_SECRET",
  ))) {
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  if (channelInboundFastIngressEnabled(provider)) {
    const events = normalizeProviderInboundEvents(provider, payload);
    const results = await Promise.allSettled(
      events.map((event) => enqueueChannelInboundEvent(event)),
    );
    const failures = results.filter((result) => result.status === "rejected");
    const duplicates = results.filter((result) =>
      result.status === "fulfilled" && result.value === "duplicate"
    ).length;
    console.warn("provider_webhook_enqueued", {
      provider,
      ...summarizeMetaWebhookPayload(payload),
      events: events.length,
      duplicates,
      failures: failures.length,
    });
    if (failures.length) {
      return jsonResponse({ error: "enqueue_failed", failed: failures.length }, 500);
    }
    return jsonResponse({ received: events.length, duplicates });
  }

  const actions = provider === "whatsapp"
    ? parseWhatsAppActions(payload)
    : parseMetaActions(provider, payload);
  const results = await Promise.allSettled(actions.map((action) => processProviderAction(provider, action)));
  const failures = results.filter((result) => result.status === "rejected");
  const duplicates = results.filter((result) =>
    result.status === "fulfilled" && result.value === "duplicate"
  ).length;
  console.warn("provider_webhook_processed", {
    provider,
    ...summarizeMetaWebhookPayload(payload),
    actions: actions.length,
    duplicates,
    failures: failures.length,
  });
  if (failures.length) return jsonResponse({ error: "processing_failed", failed: failures.length }, 500);
  return jsonResponse({ received: actions.length, duplicates });
}
