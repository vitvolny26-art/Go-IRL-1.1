import { describe, expect, it, vi } from "vitest";
import type { CreateServiceBookingInput, ServiceBooking } from "./servicesBookingRepository";
import {
  createServiceBookingIdempotencyKey,
  loadServiceAvailability,
  pragueLocalDateTimeToIso,
  submitServiceBooking,
  type SubmitServiceBookingInput,
} from "./servicesBookingMutationRepository";

const profileId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";

const localInput: CreateServiceBookingInput = {
  profileId,
  professionalName: "Studio Vita",
  serviceName: "Gel manicure",
  clientName: "Client",
  clientContact: "@client",
  contactBeforeConfirmation: false,
  date: "2026-08-05",
  time: "10:30",
  durationMinutes: 75,
  priceCzk: 890,
  currency: "CZK",
  publicLocation: "Olomouc centre",
};

const serverInput: SubmitServiceBookingInput = {
  ...localInput,
  serviceId,
  idempotencyKey: "beauty:33333333-3333-4333-8333-333333333333",
};

const localBooking: ServiceBooking = {
  ...localInput,
  id: "local-booking",
  clientUserKey: "client-local",
  status: "pending",
  createdAt: "2026-08-05T08:00:00.000Z",
};

const trustedIdentity = async () => ({ source: "trusted-telegram" });
const webTrustedIdentity = async () => ({ source: "trusted-provider" });

describe("Beauty booking mutation repository", () => {
  it("maps public availability into Prague-local slots", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { slot_start: "2026-08-05T08:30:00.000Z" },
        { slot_start: "2026-08-05T10:00:00.000Z" },
      ],
      error: null,
    }));

    const snapshot = await loadServiceAvailability(
      profileId,
      serviceId,
      "2026-08-01",
      "2026-08-31",
      { browserMock: false, client: { rpc } },
    );

    expect(rpc).toHaveBeenCalledWith("go_irl_list_public_beauty_availability", {
      p_profile_id: profileId,
      p_service_id: serviceId,
      p_from_date: "2026-08-01",
      p_to_date: "2026-08-31",
    });
    expect(snapshot).toEqual({
      source: "server",
      slotsByDate: { "2026-08-05": ["10:30", "12:00"] },
    });
  });

  it("keeps Browser Mock Mode local without calling availability RPC", async () => {
    const rpc = vi.fn();
    const snapshot = await loadServiceAvailability(
      profileId,
      serviceId,
      "2026-08-01",
      "2026-08-31",
      { browserMock: true, client: { rpc } },
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(snapshot).toEqual({ source: "browser-local", slotsByDate: {} });
  });

  it("uses explicit availability fallback only when the RPC is missing", async () => {
    const snapshot = await loadServiceAvailability(
      profileId,
      serviceId,
      "2026-08-01",
      "2026-08-31",
      {
        browserMock: false,
        client: { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) },
      },
    );

    expect(snapshot).toEqual({ source: "local-fallback", slotsByDate: {} });
  });

  it.each([
    ["Telegram", trustedIdentity],
    ["web provider", webTrustedIdentity],
  ])("creates a trusted %s server booking with a stable Prague timestamp", async (_label, initializeAuth) => {
    const rpc = vi.fn(async () => ({
      data: [{
        result: "created",
        booking_id: "44444444-4444-4444-8444-444444444444",
        booking_status: "pending",
        starts_at: "2026-08-05T08:30:00.000Z",
        updated_at: "2026-08-05T07:00:00.000Z",
      }],
      error: null,
    }));
    const createLocal = vi.fn(() => localBooking);

    const result = await submitServiceBooking(serverInput, {
      browserMock: false,
      initializeAuth,
      client: { rpc },
      createLocal,
    });

    expect(rpc).toHaveBeenCalledWith("go_irl_create_beauty_booking_v2", {
      p_profile_id: profileId,
      p_service_id: serviceId,
      p_starts_at: "2026-08-05T08:30:00.000Z",
      p_client_name: "Client",
      p_client_contact: "@client",
      p_idempotency_key: serverInput.idempotencyKey,
      p_source: null,
      p_medium: null,
      p_campaign: null,
      p_ref: null,
    });
    expect(createLocal).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      result: "created",
      source: "server",
      bookingId: "44444444-4444-4444-8444-444444444444",
      bookingStatus: "pending",
    });
  });

  it("does not convert an atomic slot conflict into local success", async () => {
    const createLocal = vi.fn(() => localBooking);
    const result = await submitServiceBooking(serverInput, {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc: async () => ({ data: [{ result: "slot_taken" }], error: null }) },
      createLocal,
    });

    expect(createLocal).not.toHaveBeenCalled();
    expect(result).toEqual({ result: "slot_taken", source: "server" });
  });

  it("uses local create only when trusted server RPC is unavailable", async () => {
    const createLocal = vi.fn(() => localBooking);
    const result = await submitServiceBooking(serverInput, {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) },
      createLocal,
    });

    expect(createLocal).toHaveBeenCalledWith(localInput);
    expect(result).toMatchObject({
      result: "local_created",
      source: "local-fallback",
      bookingId: "local-booking",
    });
  });

  it("converts Prague local time across summer and winter offsets", () => {
    expect(pragueLocalDateTimeToIso("2026-08-05", "10:30")).toBe("2026-08-05T08:30:00.000Z");
    expect(pragueLocalDateTimeToIso("2026-01-05", "10:30")).toBe("2026-01-05T09:30:00.000Z");
  });

  it("creates an RPC-safe idempotency key", () => {
    const key = createServiceBookingIdempotencyKey();
    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(key.length).toBeLessThanOrEqual(160);
    expect(key).toMatch(/^[A-Za-z0-9._:-]+$/);
  });
});
