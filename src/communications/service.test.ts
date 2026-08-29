import { describe, expect, it, vi } from "vitest";
import { sendToUser, type CommunicationIntentOutbox } from "./service.js";

describe("GROOMING018 provider-neutral business boundary", () => {
  it("queues an intent addressed only to canonical user_key", async () => {
    const enqueue = vi.fn<CommunicationIntentOutbox["enqueue"]>().mockResolvedValue({ status: "queued", intentKey: "booking:1:confirmed" });
    await sendToUser({ enqueue }, { userKey: "google:canonical", kind: "booking", payload: { bookingId: "1" }, idempotencyKey: "booking:1:confirmed", occurredAt: "2026-08-29T12:00:00Z" });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ userKey: "google:canonical", kind: "booking", idempotencyKey: "booking:1:confirmed" }));
    expect(JSON.stringify(enqueue.mock.calls[0][0])).not.toMatch(/chat_id|provider_user_id|phone|psid/i);
  });
  it("preserves one logical idempotency key across delivery retries", async () => {
    const enqueue = vi.fn<CommunicationIntentOutbox["enqueue"]>().mockResolvedValue({ status: "duplicate", intentKey: "review:visit:1" });
    const input = { userKey: "user:1", kind: "review" as const, payload: { visitId: "1" }, idempotencyKey: "review:visit:1" };
    await sendToUser({ enqueue }, input); await sendToUser({ enqueue }, input);
    expect(enqueue.mock.calls.map(([intent]) => intent.intentKey)).toEqual(["review:visit:1", "review:visit:1"]);
  });
});
