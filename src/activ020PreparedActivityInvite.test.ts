import { beforeEach, describe, expect, it, vi } from "vitest";

const { sharePreparedTelegramInvite, getTrustedAccessToken } = vi.hoisted(() => ({
  sharePreparedTelegramInvite: vi.fn(),
  getTrustedAccessToken: vi.fn(),
}));
vi.mock("./telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./telegram")>()),
  sharePreparedTelegramInvite,
}));
vi.mock("./authSession", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./authSession")>()),
  getTrustedAccessToken,
}));
import { deliverPreparedActivityInvite, prepareActivityInvite } from "./activ020PreparedActivityInvite";

const draftId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";

describe("Activ020 prepared Activity invitation orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing prepared message from server", async () => {
    getTrustedAccessToken.mockResolvedValue("trusted");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    try {
      await expect(prepareActivityInvite(draftId)).rejects.toThrow("activity_invite_preparation_unconfirmed");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("rejects invalid identifiers without invoking Telegram or publishing", async () => {
    await expect(deliverPreparedActivityInvite({ draftId: "invalid", preparedMessageId: "x" }))
      .rejects.toThrow("invalid_prepared_activity_invite");
    expect(sharePreparedTelegramInvite).not.toHaveBeenCalled();
  });

  it("retries publication until the Telegram webhook confirms delivery", async () => {
    vi.useFakeTimers();
    sharePreparedTelegramInvite.mockResolvedValue(true);
    getTrustedAccessToken.mockResolvedValue("trusted");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ activityId: draftId }) });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const pending = deliverPreparedActivityInvite({ draftId, preparedMessageId: "prepared" });
      await vi.advanceTimersByTimeAsync(500);
      await expect(pending).resolves.toEqual({ sent: true, publishedActivityId: draftId });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("does not call the publication endpoint when the user cancels Telegram share", async () => {
    sharePreparedTelegramInvite.mockResolvedValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await expect(deliverPreparedActivityInvite({ draftId, preparedMessageId: "prepared" }))
        .resolves.toEqual({ sent: false, publishedActivityId: null });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(getTrustedAccessToken).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
