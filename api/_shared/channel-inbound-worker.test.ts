import { describe, expect, it, vi } from "vitest";
import type { ClaimedChannelInboundEvent } from "./channel-inbound-queue.js";
import {
  channelInboundEventToAction,
  channelInboundRetryDelayMs,
  runChannelInboundWorkerBatch,
} from "./channel-inbound-worker.js";

const messengerEvent = (overrides: Partial<ClaimedChannelInboundEvent> = {}): ClaimedChannelInboundEvent => ({
  id: "11111111-1111-4111-8111-111111111111",
  event_id: "mid-1",
  provider: "meta",
  channel: "messenger",
  account_id: "page-1",
  sender_id: "psid-1",
  conversation_id: "meta:messenger:page-1:psid-1",
  event_type: "message.text",
  provider_timestamp: "2026-08-11T18:00:00.000Z",
  received_at: "2026-08-11T18:00:01.000Z",
  payload: { text: "Привет" },
  attempt_count: 1,
  ...overrides,
});

describe("channel inbound VPS worker", () => {
  it("restores the legacy Meta fallback event id across sync-to-queue cutover", () => {
    expect(channelInboundEventToAction(messengerEvent({
      event_id: `sha256:${"a".repeat(64)}`,
      event_type: "postback",
      payload: { action_payload: "details:11111111-1111-4111-8111-111111111111" },
    }))).toMatchObject({
      id: "messenger:psid-1:1786471200000",
      providerUserId: "psid-1",
      displayName: "Messenger User",
      actionPayload: "details:11111111-1111-4111-8111-111111111111",
    });
  });

  it("restores Messenger referral semantics from the minimized envelope", () => {
    expect(channelInboundEventToAction(messengerEvent({
      event_id: `sha256:${"b".repeat(64)}`,
      event_type: "referral",
      payload: { ref: "event:11111111-1111-4111-8111-111111111111" },
    }))).toMatchObject({
      actionPayload: "details:11111111-1111-4111-8111-111111111111",
    });
  });

  it("preserves the minimized WhatsApp display name when available", () => {
    expect(channelInboundEventToAction(messengerEvent({
      event_id: "wamid-1",
      channel: "whatsapp",
      sender_id: "420777000111",
      event_type: "message.text",
      payload: { text: "Ahoj", display_name: "Jan Novak" },
    }))).toMatchObject({
      id: "wamid-1",
      providerUserId: "420777000111",
      displayName: "Jan Novak",
      text: "Ahoj",
    });
  });

  it("marks processed and duplicate provider actions as processed in the durable queue", async () => {
    const first = messengerEvent();
    const second = messengerEvent({ id: "22222222-2222-4222-8222-222222222222", event_id: "mid-2" });
    const queue = {
      claim: vi.fn().mockResolvedValue([first, second]),
      finish: vi.fn().mockResolvedValue(undefined),
    };
    const processAction = vi.fn()
      .mockResolvedValueOnce("processed")
      .mockResolvedValueOnce("duplicate");
    const now = vi.fn()
      .mockReturnValueOnce(Date.parse("2026-08-11T18:00:31.000Z"))
      .mockReturnValue(Date.parse("2026-08-11T18:00:31.025Z"));

    await expect(runChannelInboundWorkerBatch({ queue, processAction, now })).resolves.toEqual({
      claimed: 2,
      processed: 1,
      duplicates: 1,
      retried: 0,
      deadLetter: 0,
      oldestClaimedAgeSeconds: 30,
      durationMs: 25,
    });
    expect(queue.finish).toHaveBeenNthCalledWith(1, first.id, { status: "processed" });
    expect(queue.finish).toHaveBeenNthCalledWith(2, second.id, { status: "processed" });
  });

  it("schedules exponential retry before the configured attempt ceiling", async () => {
    const event = messengerEvent({ attempt_count: 2 });
    const queue = {
      claim: vi.fn().mockResolvedValue([event]),
      finish: vi.fn().mockResolvedValue(undefined),
    };
    const processAction = vi.fn().mockRejectedValue(new Error("meta_send_failed:503:private body"));
    const nowMs = Date.parse("2026-08-11T18:10:00.000Z");
    const now = vi.fn().mockReturnValue(nowMs);

    const summary = await runChannelInboundWorkerBatch({
      queue,
      processAction,
      now,
      maxAttempts: 5,
    });

    expect(summary.retried).toBe(1);
    expect(queue.finish).toHaveBeenCalledWith(event.id, {
      status: "retry",
      errorCode: "meta_send_failed_503",
      retryAt: new Date(nowMs + 60_000).toISOString(),
    });
  });

  it("dead-letters an event at the configured attempt ceiling", async () => {
    const event = messengerEvent({ attempt_count: 5 });
    const queue = {
      claim: vi.fn().mockResolvedValue([event]),
      finish: vi.fn().mockResolvedValue(undefined),
    };
    const processAction = vi.fn().mockRejectedValue(new Error("meta_transport_failed:ENETUNREACH"));

    const summary = await runChannelInboundWorkerBatch({
      queue,
      processAction,
      maxAttempts: 5,
    });

    expect(summary.deadLetter).toBe(1);
    expect(queue.finish).toHaveBeenCalledWith(event.id, {
      status: "dead_letter",
      errorCode: "meta_transport_ENETUNREACH",
    });
  });

  it("uses the same bounded backoff shape as the existing delivery worker", () => {
    expect(channelInboundRetryDelayMs(1)).toBe(30_000);
    expect(channelInboundRetryDelayMs(2)).toBe(60_000);
    expect(channelInboundRetryDelayMs(20)).toBe(60 * 60_000);
  });
});
