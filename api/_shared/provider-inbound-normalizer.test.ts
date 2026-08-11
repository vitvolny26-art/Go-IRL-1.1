import { describe, expect, it } from "vitest";
import { normalizeProviderInboundEvents } from "./provider-inbound-normalizer.js";

const receivedAt = "2026-08-11T09:00:00.000Z";

describe("provider inbound normalizer", () => {
  it("normalizes Messenger text while preserving the native message id", () => {
    expect(normalizeProviderInboundEvents("messenger", {
      object: "page",
      entry: [{
        id: "page-1",
        messaging: [{
          sender: { id: "psid-1" },
          recipient: { id: "page-1" },
          timestamp: 1786435200000,
          message: { mid: "mid-1", text: "Привет" },
        }],
      }],
    }, receivedAt)).toEqual([{
      event_id: "mid-1",
      provider: "meta",
      channel: "messenger",
      account_id: "page-1",
      sender_id: "psid-1",
      conversation_id: "meta:messenger:page-1:psid-1",
      event_type: "message.text",
      provider_timestamp: "2026-08-11T08:00:00.000Z",
      received_at: receivedAt,
      payload: { text: "Привет" },
      processing_status: "queued",
      attempt_count: 0,
    }]);
  });

  it("normalizes Instagram quick replies as interactive messages", () => {
    const [event] = normalizeProviderInboundEvents("instagram", {
      object: "instagram",
      entry: [{
        id: "ig-1",
        messaging: [{
          sender: { id: "igsid-1" },
          timestamp: 1786435200000,
          message: {
            mid: "ig-mid-1",
            text: "Join",
            quick_reply: { payload: "join:event-1" },
          },
        }],
      }],
    }, receivedAt);

    expect(event).toMatchObject({
      event_id: "ig-mid-1",
      channel: "instagram",
      account_id: "ig-1",
      sender_id: "igsid-1",
      event_type: "message.interactive",
      payload: { text: "Join", action_payload: "join:event-1" },
    });
  });

  it("normalizes WhatsApp button replies using phone number and message ids", () => {
    const [event] = normalizeProviderInboundEvents("whatsapp", {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: "phone-1" },
            messages: [{
              id: "wamid-1",
              from: "420777000111",
              timestamp: "1786435200",
              type: "interactive",
              interactive: {
                type: "button_reply",
                button_reply: { id: "details:event-1", title: "Details" },
              },
            }],
          },
        }],
      }],
    }, receivedAt);

    expect(event).toMatchObject({
      event_id: "wamid-1",
      channel: "whatsapp",
      account_id: "phone-1",
      sender_id: "420777000111",
      event_type: "message.interactive",
      payload: { action_payload: "details:event-1", title: "Details" },
    });
  });

  it("derives the same deterministic id for a redelivered Meta postback without a native id", () => {
    const payload = {
      object: "page",
      entry: [{
        id: "page-1",
        messaging: [{
          sender: { id: "psid-1" },
          timestamp: 1786435200000,
          postback: { payload: "details:event-1", title: "Details" },
        }],
      }],
    };

    const first = normalizeProviderInboundEvents("messenger", payload, receivedAt)[0];
    const second = normalizeProviderInboundEvents("messenger", payload, "2026-08-11T09:05:00.000Z")[0];

    expect(first.event_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(second.event_id).toBe(first.event_id);
  });

  it("normalizes Messenger referral events without retaining the raw webhook body", () => {
    const [event] = normalizeProviderInboundEvents("messenger", {
      object: "page",
      entry: [{
        id: "page-1",
        messaging: [{
          sender: { id: "psid-1" },
          timestamp: 1786435200000,
          referral: { ref: "event:abc", source: "SHORTLINK", type: "OPEN_THREAD" },
        }],
      }],
    }, receivedAt);

    expect(event).toMatchObject({
      event_type: "referral",
      payload: { ref: "event:abc", source: "SHORTLINK", type: "OPEN_THREAD" },
    });
    expect(event.payload).not.toHaveProperty("sender");
  });

  it("ignores echo and unsupported provider events", () => {
    expect(normalizeProviderInboundEvents("messenger", {
      entry: [{ messaging: [{
        sender: { id: "psid-1" },
        timestamp: 1786435200000,
        message: { mid: "echo-1", text: "echo", is_echo: true },
      }] }],
    }, receivedAt)).toEqual([]);

    expect(normalizeProviderInboundEvents("whatsapp", {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: "phone-1" },
        messages: [{ id: "wamid-image", from: "1", type: "image" }],
      } }] }],
    }, receivedAt)).toEqual([]);
  });
});
