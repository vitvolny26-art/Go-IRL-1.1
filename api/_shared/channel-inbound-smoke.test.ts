import { describe, expect, it } from "vitest";
import {
  buildChannelInboundSmokeEvent,
  isChannelInboundSmokeProcessed,
  validateChannelInboundSmokeFixtureId,
} from "./channel-inbound-smoke.js";

describe("channel inbound production smoke fixture", () => {
  it("builds a deterministic non-user Messenger event with no outbound command", () => {
    const event = buildChannelInboundSmokeEvent(
      "goirl-queue-smoke-20260812-a",
      "2026-08-12T18:40:00.000Z",
    );
    expect(event.event_id).toBe("goirl-queue-smoke-20260812-a");
    expect(event.sender_id).toBe("fixture:goirl-queue-smoke-20260812-a");
    expect(event.payload).toEqual({
      display_name: "GO IRL Queue Smoke Fixture",
      action_payload: "smoke:no-op",
      fixture: true,
    });
  });

  it("rejects arbitrary fixture identifiers", () => {
    expect(() => validateChannelInboundSmokeFixtureId("real-user-123")).toThrow("invalid_smoke_fixture_id");
  });

  it("requires processed state and at least one worker attempt", () => {
    expect(isChannelInboundSmokeProcessed({ processing_status: "processed", attempt_count: 1 })).toBe(true);
    expect(isChannelInboundSmokeProcessed({ processing_status: "queued", attempt_count: 0 })).toBe(false);
  });
});
