import { describe, expect, it, vi } from "vitest";
import type { ServiceBooking } from "./servicesBookingRepository";
import {
  loadProfessionalServiceBookings,
  rescheduleProfessionalServiceBooking,
  transitionProfessionalServiceBooking,
} from "./servicesBookingProfessionalRepository";

const localBooking: ServiceBooking = {
  id: "local-booking",
  profileId: "profile-local",
  professionalName: "Local professional",
  serviceName: "Local service",
  clientUserKey: "client-local",
  clientName: "Local client",
  clientContact: "Telegram",
  contactBeforeConfirmation: false,
  date: "2026-08-05",
  time: "12:00",
  durationMinutes: 60,
  priceCzk: 700,
  currency: "CZK",
  publicLocation: "Olomouc",
  status: "pending",
  createdAt: "2026-08-05T08:00:00.000Z",
};

const trustedIdentity = async () => ({ source: "trusted-telegram" });
const trustedProviderIdentity = async () => ({ source: "trusted-provider" });

describe("Beauty professional booking repository", () => {
  it("loads the owned profile and maps the professional server projection", async () => {
    const rpc = vi.fn(async (functionName: string) => {
      if (functionName === "get_my_beauty_profile_v3") {
        return { data: [{ profile_id: "profile-1" }], error: null };
      }
      return {
        data: [{
          booking_id: "server-booking",
          profile_id: "profile-1",
          service_id: "service-1",
          client_user_key: "client-1",
          client_name: "Petra K.",
          client_contact: "+420 777 222 333",
          booking_status: "pending",
          starts_at: "2026-08-05T08:30:00.000Z",
          service_name: { en: "Gel manicure", ru: "Гель-маникюр" },
          duration_minutes: 75,
          price_czk: 890,
          currency: "CZK",
          public_location: "Olomouc centre",
          exact_address: "Horní náměstí 1",
          created_at: "2026-08-04T12:00:00.000Z",
          updated_at: "2026-08-04T13:00:00.000Z",
        }],
        error: null,
      };
    });

    const snapshot = await loadProfessionalServiceBookings("en", {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc },
      listLocal: () => [localBooking],
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "get_my_beauty_profile_v3");
    expect(rpc).toHaveBeenNthCalledWith(2, "go_irl_list_my_beauty_professional_bookings", {
      p_profile_id: "profile-1",
      p_limit: 200,
    });
    expect(snapshot.source).toBe("server");
    expect(snapshot.profileId).toBe("profile-1");
    expect(snapshot.bookings[0]).toMatchObject({
      id: "server-booking",
      clientName: "Petra K.",
      clientContact: "+420 777 222 333",
      serviceName: "Gel manicure",
      status: "pending",
      date: "2026-08-05",
      time: "10:30",
      updatedAt: "2026-08-04T13:00:00.000Z",
    });
  });

  it("loads server bookings for a trusted provider session", async () => {
    const rpc = vi.fn(async (functionName: string) => {
      if (functionName === "get_my_beauty_profile_v3") {
        return { data: [{ profile_id: "profile-provider" }], error: null };
      }
      return {
        data: [{
          booking_id: "provider-booking",
          profile_id: "profile-provider",
          service_id: "service-provider",
          client_user_key: "client-provider",
          client_name: "Provider client",
          client_contact: "provider-contact",
          booking_status: "confirmed",
          starts_at: "2026-08-05T08:30:00.000Z",
          service_name: { en: "Provider service" },
          duration_minutes: 60,
          price_czk: 900,
          currency: "CZK",
          public_location: "Olomouc centre",
          created_at: "2026-08-04T12:00:00.000Z",
          updated_at: "2026-08-04T13:00:00.000Z",
        }],
        error: null,
      };
    });

    const snapshot = await loadProfessionalServiceBookings("en", {
      browserMock: false,
      initializeAuth: trustedProviderIdentity,
      client: { rpc },
      listLocal: () => [localBooking],
    });

    expect(snapshot.source).toBe("server");
    expect(snapshot.profileId).toBe("profile-provider");
    expect(snapshot.bookings[0]).toMatchObject({
      id: "provider-booking",
      status: "confirmed",
    });
  });

  it("uses explicit local fallback when the professional booking RPC is missing", async () => {
    const rpc = vi.fn(async (functionName: string) => functionName === "get_my_beauty_profile_v3"
      ? { data: [{ profile_id: "profile-1" }], error: null }
      : { data: null, error: { code: "PGRST202" } });

    const snapshot = await loadProfessionalServiceBookings("en", {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc },
      listLocal: () => [localBooking],
    });

    expect(snapshot.source).toBe("local-fallback");
    expect(snapshot.bookings[0]?.id).toBe("local-booking");
  });

  it("keeps Browser Mock Mode local without calling Supabase", async () => {
    const rpc = vi.fn();
    const snapshot = await loadProfessionalServiceBookings("en", {
      browserMock: true,
      client: { rpc },
      listLocal: () => [localBooking],
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(snapshot.source).toBe("browser-local");
    expect(snapshot.bookings[0]?.clientName).toBe("Local client");
  });

  it("transitions a trusted server booking with stale-write guards", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        result: "changed",
        booking_id: "server-booking",
        booking_status: "confirmed",
        updated_at: "2026-08-05T09:00:00.000Z",
      }],
      error: null,
    }));

    const output = await transitionProfessionalServiceBooking({
      bookingId: "server-booking",
      expectedStatus: "pending",
      expectedUpdatedAt: "2026-08-05T08:00:00.000Z",
      targetStatus: "confirmed",
      source: "server",
    }, {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc },
    });

    expect(rpc).toHaveBeenCalledWith("go_irl_transition_beauty_booking", {
      p_booking_id: "server-booking",
      p_expected_status: "pending",
      p_expected_updated_at: "2026-08-05T08:00:00.000Z",
      p_target_status: "confirmed",
    });
    expect(output).toEqual({
      result: "changed",
      bookingId: "server-booking",
      bookingStatus: "confirmed",
      updatedAt: "2026-08-05T09:00:00.000Z",
    });
  });

  it.each(["completed", "no_show"] as const)(
    "allows trusted-provider lifecycle transition to %s",
    async (targetStatus) => {
      const rpc = vi.fn(async () => ({
        data: [{
          result: "changed",
          booking_id: "server-booking",
          booking_status: targetStatus,
          updated_at: "2026-08-05T11:00:00.000Z",
        }],
        error: null,
      }));

      const output = await transitionProfessionalServiceBooking({
        bookingId: "server-booking",
        expectedStatus: "confirmed",
        expectedUpdatedAt: "2026-08-05T10:00:00.000Z",
        targetStatus,
        source: "server",
      }, {
        browserMock: false,
        initializeAuth: trustedProviderIdentity,
        client: { rpc },
      });

      expect(rpc).toHaveBeenCalledWith("go_irl_transition_beauty_booking", {
        p_booking_id: "server-booking",
        p_expected_status: "confirmed",
        p_expected_updated_at: "2026-08-05T10:00:00.000Z",
        p_target_status: targetStatus,
      });
      expect(output.result).toBe("changed");
      expect(output.bookingStatus).toBe(targetStatus);
    },
  );

  it("keeps a stale server result visible instead of claiming success", async () => {
    const output = await transitionProfessionalServiceBooking({
      bookingId: "server-booking",
      expectedStatus: "pending",
      expectedUpdatedAt: "2026-08-05T08:00:00.000Z",
      targetStatus: "confirmed",
      source: "server",
    }, {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc: async () => ({
        data: [{
          result: "stale",
          booking_id: "server-booking",
          booking_status: "confirmed",
          updated_at: "2026-08-05T08:30:00.000Z",
        }],
        error: null,
      }) },
    });

    expect(output.result).toBe("stale");
    expect(output.bookingStatus).toBe("confirmed");
  });

  it("reschedules a confirmed server booking with stale-write guards", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        result: "changed",
        booking_id: "server-booking",
        booking_status: "confirmed",
        starts_at: "2026-08-06T09:00:00.000Z",
        updated_at: "2026-08-05T09:30:00.000Z",
      }],
      error: null,
    }));

    const output = await rescheduleProfessionalServiceBooking({
      bookingId: "server-booking",
      expectedUpdatedAt: "2026-08-05T09:00:00.000Z",
      startsAt: "2026-08-06T09:00:00.000Z",
      source: "server",
    }, {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc },
    });

    expect(rpc).toHaveBeenCalledWith("go_irl_reschedule_beauty_booking", {
      p_booking_id: "server-booking",
      p_expected_updated_at: "2026-08-05T09:00:00.000Z",
      p_starts_at: "2026-08-06T09:00:00.000Z",
    });
    expect(output).toEqual({
      result: "changed",
      bookingId: "server-booking",
      bookingStatus: "confirmed",
      startsAt: "2026-08-06T09:00:00.000Z",
      updatedAt: "2026-08-05T09:30:00.000Z",
    });
  });

  it("preserves slot conflicts from the reschedule RPC", async () => {
    const output = await rescheduleProfessionalServiceBooking({
      bookingId: "server-booking",
      expectedUpdatedAt: "2026-08-05T09:00:00.000Z",
      startsAt: "2026-08-06T09:00:00.000Z",
      source: "server",
    }, {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc: async () => ({
        data: [{
          result: "slot_taken",
          booking_id: "server-booking",
          booking_status: "confirmed",
          starts_at: "2026-08-05T08:30:00.000Z",
          updated_at: "2026-08-05T09:00:00.000Z",
        }],
        error: null,
      }) },
    });

    expect(output.result).toBe("slot_taken");
    expect(output.startsAt).toBe("2026-08-05T08:30:00.000Z");
  });

  it("updates only local storage for a local fallback booking", async () => {
    const rpc = vi.fn();
    const updateLocal = vi.fn();
    const output = await transitionProfessionalServiceBooking({
      bookingId: "local-booking",
      expectedStatus: "pending",
      expectedUpdatedAt: localBooking.createdAt,
      targetStatus: "confirmed",
      source: "local-fallback",
    }, {
      client: { rpc },
      updateLocal,
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(updateLocal).toHaveBeenCalledWith("local-booking", "confirmed");
    expect(output.result).toBe("changed");
  });
});
