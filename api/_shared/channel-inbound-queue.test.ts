import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueChannelInboundEvent } from "./channel-inbound-queue.js";
import type { NormalizedInboundEvent } from "./provider-inbound-normalizer.js";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ rpc: rpcMock })),
}));

const runtimeEnv = (globalThis as typeof globalThis & {
  process: { env: Record<string, string | undefined> };
}).process.env;

const event: NormalizedInboundEvent = {
  event_id: "mid-1",
  provider: "meta",
  channel: "messenger",
  account_id: "page-1",
  sender_id: "psid-1",
  conversation_id: "meta:messenger:page-1:psid-1",
  event_type: "message.text",
  provider_timestamp: "2026-08-11T15:00:00.000Z",
  received_at: "2026-08-11T15:00:01.000Z",
  payload: { text: "Привет" },
  processing_status: "queued",
  attempt_count: 0,
};

describe("channel inbound queue", () => {
  beforeEach(() => {
    runtimeEnv.SUPABASE_URL = "https://example.supabase.co";
    runtimeEnv.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
    rpcMock.mockReset();
  });

  afterEach(() => {
    delete runtimeEnv.SUPABASE_URL;
    delete runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("maps the normalized envelope to the durable enqueue RPC", async () => {
    rpcMock.mockResolvedValue({ data: "queued", error: null });

    await expect(enqueueChannelInboundEvent(event)).resolves.toBe("queued");
    expect(rpcMock).toHaveBeenCalledWith("go_irl_enqueue_channel_inbound_event", {
      p_event_id: "mid-1",
      p_provider: "meta",
      p_channel: "messenger",
      p_account_id: "page-1",
      p_sender_id: "psid-1",
      p_conversation_id: "meta:messenger:page-1:psid-1",
      p_event_type: "message.text",
      p_provider_timestamp: "2026-08-11T15:00:00.000Z",
      p_received_at: "2026-08-11T15:00:01.000Z",
      p_payload: { text: "Привет" },
    });
  });

  it("accepts the idempotent duplicate result", async () => {
    rpcMock.mockResolvedValue({ data: "duplicate", error: null });
    await expect(enqueueChannelInboundEvent(event)).resolves.toBe("duplicate");
  });

  it("fails closed on an unexpected RPC result", async () => {
    rpcMock.mockResolvedValue({ data: "unknown", error: null });
    await expect(enqueueChannelInboundEvent(event)).rejects.toThrow(
      "channel_inbound_enqueue_unexpected_result",
    );
  });
});
