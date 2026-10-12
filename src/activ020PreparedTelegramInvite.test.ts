import { afterEach, describe, expect, it, vi } from "vitest";
import { sharePreparedTelegramInvite } from "./telegram";

describe("Activ020 prepared Telegram invitation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects missing prepared message id", async () => {
    await expect(sharePreparedTelegramInvite(" ")).rejects.toThrow("telegram_prepared_message_id_required");
  });

  it("does not treat unsupported clients as an invitation sent", async () => {
    vi.stubGlobal("window", { Telegram: { WebApp: { isVersionAtLeast: () => false } } });
    await expect(sharePreparedTelegramInvite("prepared")).rejects.toThrow("telegram_prepared_share_unsupported");
  });

  it("returns false on Telegram cancellation and true only on confirmed send", async () => {
    const shareMessage = vi.fn((_id: string, callback?: (success: boolean) => void) => callback?.(false));
    vi.stubGlobal("window", { Telegram: { WebApp: { isVersionAtLeast: () => true, shareMessage } } });
    await expect(sharePreparedTelegramInvite("prepared")).resolves.toBe(false);
    expect(shareMessage).toHaveBeenCalledWith("prepared", expect.any(Function));
    shareMessage.mockImplementation((_id: string, callback?: (success: boolean) => void) => callback?.(true));
    await expect(sharePreparedTelegramInvite("prepared")).resolves.toBe(true);
  });
});
