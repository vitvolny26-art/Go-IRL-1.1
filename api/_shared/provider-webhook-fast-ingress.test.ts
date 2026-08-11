import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueChannelInboundEvent } from "./channel-inbound-queue.js";
import { claimProviderInboundEvent } from "./provider-inbound-service.js";
import { recordProviderInbound } from "./provider-join-service.js";
import {
  channelInboundFastIngressEnabled,
  handleProviderWebhook,
} from "./provider-webhook.js";

vi.mock("./channel-inbound-queue.js", () => ({
  enqueueChannelInboundEvent: vi.fn(),
}));

vi.mock("./provider-inbound-service.js", () => ({
  claimProviderInboundEvent: vi.fn(),
  completeProviderInboundEvent: vi.fn(),
}));

vi.mock("./provider-join-service.js", () => ({
  getProviderEventSummary: vi.fn(),
  joinProviderEvent: vi.fn(),
  recordProviderInbound: vi.fn(),
  setProviderNotificationConsent: vi.fn(),
}));

const runtimeEnv = (globalThis as typeof globalThis & {
  process: { env: Record<string, string | undefined> };
}).process.env;

const signedRequest = (rawBody: string) => new Request(
  "https://example.test/api/messenger/webhook",
  {
    method: "POST",
    body: rawBody,
    headers: {
      "x-hub-signature-256": `sha256=${createHmac("sha256", "test-app-secret")
        .update(rawBody)
        .digest("hex")}`,
    },
  },
);

const messengerBody = () => JSON.stringify({
  object: "page",
  entry: [{
    id: "page-1",
    messaging: [{
      sender: { id: "psid-1" },
      recipient: { id: "page-1" },
      timestamp: 1786460400000,
      message: { mid: "mid-fast-1", text: "Привет" },
    }],
  }],
});

describe("provider webhook fast ingress gate", () => {
  beforeEach(() => {
    runtimeEnv.META_APP_SECRET = "test-app-secret";
    runtimeEnv.META_VERIFY_TOKEN = "test-verify-token";
    runtimeEnv.GO_IRL_CHANNEL_INBOUND_FAST_INGRESS_CHANNELS = "messenger";
    vi.mocked(enqueueChannelInboundEvent).mockReset().mockResolvedValue("queued");
    vi.mocked(claimProviderInboundEvent).mockReset().mockResolvedValue({
      claimed: false,
      eventKey: "a".repeat(64),
    });
    vi.mocked(recordProviderInbound).mockReset();
  });

  afterEach(() => {
    delete runtimeEnv.META_APP_SECRET;
    delete runtimeEnv.META_VERIFY_TOKEN;
    delete runtimeEnv.GO_IRL_CHANNEL_INBOUND_FAST_INGRESS_CHANNELS;
    vi.unstubAllGlobals();
  });

  it("activates only explicitly listed channels", () => {
    runtimeEnv.GO_IRL_CHANNEL_INBOUND_FAST_INGRESS_CHANNELS = " messenger, whatsapp ";
    expect(channelInboundFastIngressEnabled("messenger")).toBe(true);
    expect(channelInboundFastIngressEnabled("whatsapp")).toBe(true);
    expect(channelInboundFastIngressEnabled("instagram")).toBe(false);
  });

  it("durably enqueues and ACKs without synchronous business processing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleProviderWebhook("messenger", signedRequest(messengerBody()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: 1, duplicates: 0 });
    expect(enqueueChannelInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_id: "mid-fast-1",
      provider: "meta",
      channel: "messenger",
      account_id: "page-1",
      sender_id: "psid-1",
      conversation_id: "meta:messenger:page-1:psid-1",
      event_type: "message.text",
      payload: { text: "Привет" },
      processing_status: "queued",
      attempt_count: 0,
    }));
    expect(claimProviderInboundEvent).not.toHaveBeenCalled();
    expect(recordProviderInbound).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ACKs an idempotent duplicate", async () => {
    vi.mocked(enqueueChannelInboundEvent).mockResolvedValue("duplicate");

    const response = await handleProviderWebhook("messenger", signedRequest(messengerBody()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: 1, duplicates: 1 });
    expect(claimProviderInboundEvent).not.toHaveBeenCalled();
  });

  it("returns retryable failure when durable enqueue fails", async () => {
    vi.mocked(enqueueChannelInboundEvent).mockRejectedValue(new Error("queue unavailable"));

    const response = await handleProviderWebhook("messenger", signedRequest(messengerBody()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "enqueue_failed", failed: 1 });
    expect(claimProviderInboundEvent).not.toHaveBeenCalled();
  });

  it("keeps the existing synchronous path when the provider is not activated", async () => {
    runtimeEnv.GO_IRL_CHANNEL_INBOUND_FAST_INGRESS_CHANNELS = "instagram";

    const response = await handleProviderWebhook("messenger", signedRequest(messengerBody()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: 1, duplicates: 1 });
    expect(enqueueChannelInboundEvent).not.toHaveBeenCalled();
    expect(claimProviderInboundEvent).toHaveBeenCalledWith("messenger", "mid-fast-1");
  });
});
