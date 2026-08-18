import { describe, expect, it, vi } from "vitest";
import { loadBookingConfirmationMode, saveBookingConfirmationMode } from "./servicesBookingConfirmationModeRepository";

const trusted = async () => ({ source: "trusted-provider" });

describe("booking confirmation mode repository", () => {
  it("loads automatic mode from the owner RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ confirmation_mode: "automatic" }], error: null });
    await expect(loadBookingConfirmationMode({ client: { rpc }, initializeAuth: trusted, browserMock: false }))
      .resolves.toEqual({ mode: "automatic", source: "server" });
  });

  it("persists manual mode through the owner RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ confirmation_mode: "manual" }], error: null });
    await expect(saveBookingConfirmationMode("manual", { client: { rpc }, initializeAuth: trusted, browserMock: false }))
      .resolves.toEqual({ mode: "manual", source: "server" });
    expect(rpc).toHaveBeenCalledWith("go_irl_set_my_beauty_confirmation_mode", { p_confirmation_mode: "manual" });
  });

  it("fails closed to manual when the RPC is not deployed", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(loadBookingConfirmationMode({ client: { rpc }, initializeAuth: trusted, browserMock: false }))
      .resolves.toEqual({ mode: "manual", source: "local-fallback" });
  });
});
