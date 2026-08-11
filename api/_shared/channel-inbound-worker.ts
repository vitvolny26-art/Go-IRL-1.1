import {
  ChannelInboundQueueRepository,
  type ClaimedChannelInboundEvent,
} from "./channel-inbound-queue.js";
import {
  processProviderAction,
  providerProcessingErrorCode,
  type ProviderInboundAction,
} from "./provider-webhook.js";

const defaultMaxAttempts = 5;
const maxDatabaseAttempts = 20;

const safeText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const defaultDisplayName = (channel: ClaimedChannelInboundEvent["channel"]) =>
  channel === "instagram"
    ? "Instagram User"
    : channel === "whatsapp"
      ? "WhatsApp User"
      : "Messenger User";

const legacyMetaEventId = (event: ClaimedChannelInboundEvent) => {
  if (event.channel === "whatsapp" || !event.event_id.startsWith("sha256:")) {
    return event.event_id;
  }
  if (!event.provider_timestamp) return event.event_id;
  const timestamp = Date.parse(event.provider_timestamp);
  return Number.isFinite(timestamp)
    ? `${event.channel}:${event.sender_id}:${timestamp}`
    : event.event_id;
};

export function channelInboundEventToAction(
  event: ClaimedChannelInboundEvent,
): ProviderInboundAction {
  const text = safeText(event.payload.text);
  let actionPayload = safeText(event.payload.action_payload);
  if (!actionPayload && event.channel === "messenger" && event.event_type === "referral") {
    const ref = safeText(event.payload.ref);
    if (ref?.startsWith("event:") && ref.length > "event:".length) {
      actionPayload = `details:${ref.slice("event:".length)}`;
    }
  }
  const displayName = safeText(event.payload.display_name)?.slice(0, 120)
    || defaultDisplayName(event.channel);

  return {
    id: legacyMetaEventId(event),
    providerUserId: event.sender_id,
    displayName,
    ...(text ? { text } : {}),
    ...(actionPayload ? { actionPayload } : {}),
  };
}

export const channelInboundRetryDelayMs = (attemptCount: number) =>
  Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attemptCount - 1));

export type ChannelInboundWorkerSummary = {
  claimed: number;
  processed: number;
  duplicates: number;
  retried: number;
  deadLetter: number;
  oldestClaimedAgeSeconds: number;
  durationMs: number;
};

type ChannelInboundWorkerOptions = {
  limit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  queue?: Pick<ChannelInboundQueueRepository, "claim" | "finish">;
  processAction?: typeof processProviderAction;
  now?: () => number;
};

export async function runChannelInboundWorkerBatch(
  options: ChannelInboundWorkerOptions = {},
): Promise<ChannelInboundWorkerSummary> {
  const startedAt = (options.now || Date.now)();
  const queue = options.queue || new ChannelInboundQueueRepository();
  const processAction = options.processAction || processProviderAction;
  const maxAttempts = Math.min(
    maxDatabaseAttempts,
    Math.max(1, options.maxAttempts ?? defaultMaxAttempts),
  );
  const events = await queue.claim(options.limit ?? 50, options.leaseSeconds ?? 300);
  const oldestReceivedAt = events.reduce<number | null>((oldest, event) => {
    const receivedAt = Date.parse(event.received_at);
    if (!Number.isFinite(receivedAt)) return oldest;
    return oldest === null || receivedAt < oldest ? receivedAt : oldest;
  }, null);
  const summary: ChannelInboundWorkerSummary = {
    claimed: events.length,
    processed: 0,
    duplicates: 0,
    retried: 0,
    deadLetter: 0,
    oldestClaimedAgeSeconds: oldestReceivedAt === null
      ? 0
      : Math.max(0, Math.floor((startedAt - oldestReceivedAt) / 1000)),
    durationMs: 0,
  };

  for (const event of events) {
    try {
      const result = await processAction(event.channel, channelInboundEventToAction(event));
      await queue.finish(event.id, { status: "processed" });
      if (result === "duplicate") summary.duplicates += 1;
      else summary.processed += 1;
    } catch (error) {
      const errorCode = providerProcessingErrorCode(error);
      if (event.attempt_count >= maxAttempts) {
        await queue.finish(event.id, { status: "dead_letter", errorCode });
        summary.deadLetter += 1;
      } else {
        const retryAt = new Date(
          (options.now || Date.now)() + channelInboundRetryDelayMs(event.attempt_count),
        ).toISOString();
        await queue.finish(event.id, {
          status: "retry",
          errorCode,
          retryAt,
        });
        summary.retried += 1;
      }
    }
  }

  summary.durationMs = Math.max(0, (options.now || Date.now)() - startedAt);
  return summary;
}
