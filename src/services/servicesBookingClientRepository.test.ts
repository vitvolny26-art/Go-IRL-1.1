import { describe, expect, it, vi } from "vitest";
import type { ServiceBooking } from "./servicesBookingRepository";
import { loadClientServiceBookings } from "./servicesBookingClientRepository";

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
const webTrustedIdentity = async () => ({ source: "trusted-provider" });

describe("Beauty client booking repository", () => {
  it("maps the trusted server projection and enriches the professional name", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        booking_id: "server-booking",
        profile_id: "profile-1",
        service_id: "service-1",
        booking_status: "confirmed",
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
    }));

    const snapshot = await loadClientServiceBookings("en", {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc },
      listLocal: () => [localBooking],
      loadDirectory: async () => [{
        profileId: "profile-1",
        serviceId: "service-1",
        displayName: "Studio Vita",
      } as never],
    });

    expect(rpc).toHaveBeenCalledWith("go_irl_list_my_beauty_bookings", { p_limit: 100 });
    expect(snapshot.source).toBe("server");
    expect(snapshot.bookings).toHaveLength(1);
    expect(snapshot.bookings[0]).toMatchObject({
      id: "server-booking",
      professionalName: "Studio Vita",
      serviceName: "Gel manicure",
      status: "confirmed",
      date: "2026-08-05",
      time: "10:30",
      exactAddress: "Horní náměstí 1",
    });
  });

  it("uses the server projection for trusted web provider sessions", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const snapshot = await loadClientServiceBookings("en", {
      browserMock: false,
      initializeAuth: webTrustedIdentity,
      client: { rpc },
      listLocal: () => [localBooking],
      loadDirectory: async () => [],
    });

    expect(rpc).toHaveBeenCalledWith("go_irl_list_my_beauty_bookings", { p_limit: 100 });
    expect(snapshot).toEqual({ bookings: [], source: "server" });
  });

  it("uses the explicit local fallback while the RPC is unavailable", async () => {
    const snapshot = await loadClientServiceBookings("en", {
      browserMock: false,
      initializeAuth: trustedIdentity,
      client: { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) },
      listLocal: () => [localBooking],
    });

    expect(snapshot.source).toBe("local-fallback");
    expect(snapshot.bookings[0]?.id).toBe("local-booking");
  });

  it("keeps Browser Mock Mode local without calling Supabase", async () => {
    const rpc = vi.fn();
    const snapshot = await loadClientServiceBookings("en", {
      browserMock: true,
      client: { rpc },
      listLocal: () => [localBooking],
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(snapshot.source).toBe("browser-local");
    expect(snapshot.bookings[0]?.professionalName).toBe("Local professional");
  });
});
