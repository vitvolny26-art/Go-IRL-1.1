import { beforeEach, describe, expect, it, vi } from "vitest";

const sharePreparedTelegramInvite = vi.fn();
const getTrustedAccessToken = vi.fn();
vi.mock("./telegram", () => ({ sharePreparedTelegramInvite }));
vi.mock("./authSession", () => ({ getTrustedAccessToken }));
import { deliverPreparedActivityInvite } from "./activ020PreparedActivityInvite";

const draftId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";

describe("Activ020 prepared Activity invitation orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid identifiers without invoking Telegram or publishing", async () => {
    await expect(deliverPreparedActivityInvite({ draftId: "invalid", preparedMessageId: "x" }))
      .rejects.toThrow("invalid_prepared_activity_invite");
    expect(sharePreparedTelegramInvite).not.toHaveBeenCalled();
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
