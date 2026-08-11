import { createHash } from "node:crypto";

export type InboundChannel = "messenger" | "instagram" | "whatsapp";

export type NormalizedInboundEvent = {
  event_id: string;
  provider: "meta";
  channel: InboundChannel;
  account_id: string | null;
  sender_id: string;
  conversation_id: string;
  event_type: "message.text" | "message.interactive" | "postback" | "referral";
  provider_timestamp: string | null;
  received_at: string;
  payload: Record<string, unknown>;
  processing_status: "queued";
  attempt_count: 0;
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null ? value as UnknownRecord : null;

const asRecords = (value: unknown) => Array.isArray(value)
  ? value.map(asRecord).filter(Boolean) as UnknownRecord[]
  : [];

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.keys(record).sort().map((key) => [key, stableValue(record[key])]),
  );
};

const deterministicEventId = (parts: Record<string, unknown>) =>
  `sha256:${createHash("sha256").update(JSON.stringify(stableValue(parts))).digest("hex")}`;

const timestampIso = (value: unknown, unit: "milliseconds" | "seconds") => {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(unit === "seconds" ? numeric * 1000 : numeric);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const conversationId = (channel: InboundChannel, accountId: string | null, senderId: string) =>
  `meta:${channel}:${accountId || "unknown"}:${senderId}`;

const buildEnvelope = ({
  channel,
  accountId,
  senderId,
  nativeId,
  providerTimestamp,
  eventType,
  payload,
  receivedAt,
}: {
  channel: InboundChannel;
  accountId: string | null;
  senderId: string;
  nativeId?: string;
  providerTimestamp: string | null;
  eventType: NormalizedInboundEvent["event_type"];
  payload: Record<string, unknown>;
  receivedAt: string;
}): NormalizedInboundEvent | null => {
  if (!senderId) return null;
  const eventId = nativeId || (providerTimestamp
    ? deterministicEventId({
      provider: "meta",
      channel,
      account_id: accountId,
      sender_id: senderId,
      provider_timestamp: providerTimestamp,
      event_type: eventType,
      payload,
    })
    : "");
  if (!eventId) return null;
  return {
    event_id: eventId,
    provider: "meta",
    channel,
    account_id: accountId,
    sender_id: senderId,
    conversation_id: conversationId(channel, accountId, senderId),
    event_type: eventType,
    provider_timestamp: providerTimestamp,
    received_at: receivedAt,
    payload,
    processing_status: "queued",
    attempt_count: 0,
  };
};

const normalizeMetaMessaging = (
  channel: "messenger" | "instagram",
  payload: unknown,
  receivedAt: string,
): NormalizedInboundEvent[] => {
  const root = asRecord(payload);
  return asRecords(root?.entry).flatMap((entry) => {
    const entryId = typeof entry.id === "string" ? entry.id : null;
    return asRecords(entry.messaging).flatMap((event) => {
      const sender = asRecord(event.sender);
      const recipient = asRecord(event.recipient);
      const senderId = typeof sender?.id === "string" ? sender.id : "";
      const accountId = entryId || (typeof recipient?.id === "string" ? recipient.id : null);
      const providerTimestamp = timestampIso(event.timestamp, "milliseconds");
      const message = asRecord(event.message);
      const postback = asRecord(event.postback);
      const referral = asRecord(event.referral) || asRecord(postback?.referral);

      if (message?.is_echo === true) return [];

      if (message) {
        const nativeId = typeof message.mid === "string" ? message.mid : undefined;
        const text = typeof message.text === "string" ? message.text : undefined;
        const quickReply = asRecord(message.quick_reply);
        const actionPayload = typeof quickReply?.payload === "string" ? quickReply.payload : undefined;
        if (text !== undefined || actionPayload !== undefined) {
          const normalized = buildEnvelope({
            channel,
            accountId,
            senderId,
            nativeId,
            providerTimestamp,
            eventType: actionPayload !== undefined ? "message.interactive" : "message.text",
            payload: {
              ...(text !== undefined ? { text } : {}),
              ...(actionPayload !== undefined ? { action_payload: actionPayload } : {}),
            },
            receivedAt,
          });
          return normalized ? [normalized] : [];
        }
      }

      if (postback) {
        const nativeId = typeof postback.mid === "string" ? postback.mid : undefined;
        const actionPayload = typeof postback.payload === "string" ? postback.payload : undefined;
        const title = typeof postback.title === "string" ? postback.title : undefined;
        const normalized = buildEnvelope({
          channel,
          accountId,
          senderId,
          nativeId,
          providerTimestamp,
          eventType: "postback",
          payload: {
            ...(actionPayload !== undefined ? { action_payload: actionPayload } : {}),
            ...(title !== undefined ? { title } : {}),
          },
          receivedAt,
        });
        return normalized ? [normalized] : [];
      }

      if (referral) {
        const ref = typeof referral.ref === "string" ? referral.ref : undefined;
        const source = typeof referral.source === "string" ? referral.source : undefined;
        const type = typeof referral.type === "string" ? referral.type : undefined;
        const normalized = buildEnvelope({
          channel,
          accountId,
          senderId,
          providerTimestamp,
          eventType: "referral",
          payload: {
            ...(ref !== undefined ? { ref } : {}),
            ...(source !== undefined ? { source } : {}),
            ...(type !== undefined ? { type } : {}),
          },
          receivedAt,
        });
        return normalized ? [normalized] : [];
      }

      return [];
    });
  });
};

const normalizeWhatsApp = (payload: unknown, receivedAt: string): NormalizedInboundEvent[] => {
  const root = asRecord(payload);
  return asRecords(root?.entry).flatMap((entry) =>
    asRecords(entry.changes).flatMap((change) => {
      const value = asRecord(change.value);
      const metadata = asRecord(value?.metadata);
      const accountId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : null;
      const displayNames = new Map<string, string>();
      for (const contact of asRecords(value?.contacts)) {
        const profile = asRecord(contact.profile);
        if (typeof contact.wa_id === "string" && typeof profile?.name === "string" && profile.name.trim()) {
          displayNames.set(contact.wa_id, profile.name.trim().slice(0, 120));
        }
      }
      return asRecords(value?.messages).flatMap((message) => {
        const nativeId = typeof message.id === "string" ? message.id : undefined;
        const senderId = typeof message.from === "string" ? message.from : "";
        const providerTimestamp = timestampIso(message.timestamp, "seconds");
        const type = typeof message.type === "string" ? message.type : "";
        const displayName = displayNames.get(senderId);

        if (type === "text") {
          const text = asRecord(message.text);
          if (typeof text?.body !== "string") return [];
          const normalized = buildEnvelope({
            channel: "whatsapp",
            accountId,
            senderId,
            nativeId,
            providerTimestamp,
            eventType: "message.text",
            payload: {
              text: text.body,
              ...(displayName ? { display_name: displayName } : {}),
            },
            receivedAt,
          });
          return normalized ? [normalized] : [];
        }

        if (type === "interactive") {
          const interactive = asRecord(message.interactive);
          const buttonReply = asRecord(interactive?.button_reply);
          const listReply = asRecord(interactive?.list_reply);
          const reply = buttonReply || listReply;
          const actionPayload = typeof reply?.id === "string" ? reply.id : undefined;
          if (!actionPayload) return [];
          const normalized = buildEnvelope({
            channel: "whatsapp",
            accountId,
            senderId,
            nativeId,
            providerTimestamp,
            eventType: "message.interactive",
            payload: {
              action_payload: actionPayload,
              ...(typeof reply?.title === "string" ? { title: reply.title } : {}),
              ...(displayName ? { display_name: displayName } : {}),
            },
            receivedAt,
          });
          return normalized ? [normalized] : [];
        }

        return [];
      });
    }),
  );
};

export function normalizeProviderInboundEvents(
  channel: InboundChannel,
  payload: unknown,
  receivedAt = new Date().toISOString(),
): NormalizedInboundEvent[] {
  return channel === "whatsapp"
    ? normalizeWhatsApp(payload, receivedAt)
    : normalizeMetaMessaging(channel, payload, receivedAt);
}
