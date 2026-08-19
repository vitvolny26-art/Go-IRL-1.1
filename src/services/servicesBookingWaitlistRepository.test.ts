import { describe, expect, it, vi } from "vitest";
import {
  cancelServiceWaitlist,
  createServiceWaitlistIdempotencyKey,
  joinServiceWaitlist,
  loadMyServiceWaitlist,
  loadServiceWaitlistableSlots,
} from "./servicesBookingWaitlistRepository";

const profileId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";
const trustedIdentity = async () => ({ source: "trusted-telegram" });
const webTrustedIdentity = async () => ({ source: "trusted-provider" });

const joinInput = {
  profileId,
  serviceId,
  date: "2026-08-21",
  time: "10:30",
  idempotencyKey: "beauty-wait:33333333-3333-4333-8333-333333333333",
};

describe("Beauty booking waitlist repository", () => {
  it.each([
    ["Telegram", trustedIdentity],
    ["web provider", webTrustedIdentity],
  ])("loads exact occupied slots for a trusted %s identity", async (_label, initializeAuth) => {
    const rpc = vi.fn(async () => ({
      data: [
        { slot_start: "2026-08-21T08:30:00.000Z" },
        { slot_start: "2026-08-21T10:00:00.000Z" },
      ],
      error: null,
    }));

    const snapshot = await loadServiceWaitlistableSlots(
      profileId,
      serviceId,
      "2026-08-01",
      "2026-08-31",
      { browserMock: false, initializeAuth, client: { rpc } },
    );

    expect(rpc).toHaveBeenCalledWith("go_irl_list_beauty_waitlistable_slots", {
      p_profile_id: profileId,
      p_service_id: serviceId,
      p_from_date: "2026-08-01",
      p_to_date: "2026-08-31",
    });
    expect(snapshot).toEqual({
      source: "server",
      slotsByDate: { "2026-08-21": ["10:30", "12:00"] },
    });
  });

  it("does not invent a local waitlist in Browser Mock Mode", async () => {
    const rpc = vi.fn();
    const snapshot = await loadServiceWaitlistableSlots(
      profileId,
      serviceId,
      "2026-08-01",
      "2026-08-31",
      { browserMock: true, initializeAuth: trustedIdentity, client: { rpc } },
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(snapshot).toEqual({ source: "unavailable", slotsByDate: {} });
  });

  it("fails closed for an untrusted identity", async () => {
    const rpc = vi.fn();
    const snapshot = await loadServiceWaitlistableSlots(
      profileId,
      serviceId,
      "2026-08-01",
      "2026-08-31",
      { browserMock: false, initializeAuth: async () => ({ source: "local" }), client: { rpc } },
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(snapshot.source).toBe("unavailable");
  });

  it("joins the exact server waitlist slot without creating a local booking", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        result: "joined",
        waitlist_id: "44444444-4444-4444-8444-444444444444",
        waitlist_status: "active",
        slot_start: "2026-08-21T08:30:00.000Z",
        updated_at: "2026-08-19T08:00:00.000Z",
      }],
      error: null,
    }));

    const result = await joinServiceWaitlist(joinInput, {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc },
    });

    expect(rpc).toHaveBeenCalledWith("go_irl_join_beauty_waitlist", {
      p_profile_id: profileId,
      p_service_id: serviceId,
      p_starts_at: "2026-08-21T08:30:00.000Z",
      p_idempotency_key: joinInput.idempotencyKey,
    });
    expect(result).toMatchObject({
      result: "joined",
      source: "server",
      waitlistId: "44444444-4444-4444-8444-444444444444",
      waitlistStatus: "active",
    });
  });

  it("keeps slot-available races explicit", async () => {
    const result = await joinServiceWaitlist(joinInput, {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc: async () => ({ data: [{ result: "slot_available" }], error: null }) },
    });

    expect(result).toEqual({ result: "slot_available", source: "server" });
  });

  it("lists server waitlist entries with Prague-local time", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        waitlist_id: "55555555-5555-4555-8555-555555555555",
        profile_id: profileId,
        service_id: serviceId,
        waitlist_status: "active",
        slot_start: "2026-08-21T08:30:00.000Z",
        duration_minutes: 30,
        buffer_minutes: 0,
        service_name: { en: "Gel manicure" },
        public_location: "Olomouc centrum",
        notification_count: 1,
        last_notified_at: "2026-08-20T08:00:00.000Z",
        created_at: "2026-08-19T08:00:00.000Z",
        updated_at: "2026-08-20T08:00:00.000Z",
      }],
      error: null,
    }));

    const snapshot = await loadMyServiceWaitlist("en", {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc },
    });

    expect(rpc).toHaveBeenCalledWith("go_irl_list_my_beauty_waitlist", { p_limit: 100 });
    expect(snapshot).toMatchObject({
      source: "server",
      entries: [{
        id: "55555555-5555-4555-8555-555555555555",
        status: "active",
        date: "2026-08-21",
        time: "10:30",
        serviceName: "Gel manicure",
        notificationCount: 1,
      }],
    });
  });

  it("cancels an owned waitlist entry with stale-write protection", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ result: "changed", waitlist_status: "cancelled", updated_at: "2026-08-19T09:00:00.000Z" }],
      error: null,
    }));

    const result = await cancelServiceWaitlist({
      id: "55555555-5555-4555-8555-555555555555",
      updatedAt: "2026-08-19T08:00:00.000Z",
    }, {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc },
    });

    expect(rpc).toHaveBeenCalledWith("go_irl_cancel_my_beauty_waitlist", {
      p_waitlist_id: "55555555-5555-4555-8555-555555555555",
      p_expected_updated_at: "2026-08-19T08:00:00.000Z",
    });
    expect(result).toBe("changed");
  });

  it("fails closed when the waitlist RPC is not deployed", async () => {
    const result = await joinServiceWaitlist(joinInput, {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) },
    });

    expect(result).toEqual({ result: "unavailable", source: "unavailable" });
  });

  it("creates an RPC-safe waitlist idempotency key", () => {
    const key = createServiceWaitlistIdempotencyKey();
    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(key.length).toBeLessThanOrEqual(160);
    expect(key).toMatch(/^[A-Za-z0-9._:-]+$/);
  });
});
