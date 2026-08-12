import type { NormalizedInboundEvent } from "./provider-inbound-normalizer.js";

const fixturePattern = /^goirl-queue-smoke-[a-z0-9][a-z0-9-]{2,55}$/;

export function validateChannelInboundSmokeFixtureId(value: string) {
  if (!fixturePattern.test(value)) {
    throw new Error("invalid_smoke_fixture_id");
  }
  return value;
}

export function buildChannelInboundSmokeEvent(
  fixtureId: string,
  receivedAt = new Date().toISOString(),
): NormalizedInboundEvent {
  const id = validateChannelInboundSmokeFixtureId(fixtureId);
  const senderId = `fixture:${id}`;
  return {
    event_id: id,
    provider: "meta",
    channel: "messenger",
    account_id: "goirl-production-smoke",
    sender_id: senderId,
    conversation_id: `meta:messenger:goirl-production-smoke:${senderId}`,
    event_type: "postback",
    provider_timestamp: null,
    received_at: receivedAt,
    payload: {
      display_name: "GO IRL Queue Smoke Fixture",
      action_payload: "smoke:no-op",
      fixture: true,
    },
    processing_status: "queued",
    attempt_count: 0,
  };
}

export function isChannelInboundSmokeProcessed(row: {
  processing_status?: unknown;
  attempt_count?: unknown;
}) {
  return row.processing_status === "processed"
    && typeof row.attempt_count === "number"
    && row.attempt_count >= 1;
}
