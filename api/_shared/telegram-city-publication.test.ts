import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramApi } from "./telegram-city-publication-base.js";

const publishCanonicalCityActivityBase = vi.hoisted(() => vi.fn());

vi.mock("./telegram-city-publication-base.js", () => ({
  createCanonicalCityTopic: vi.fn(),
  publishCanonicalCityActivity: publishCanonicalCityActivityBase,
  syncJoinedParticipantTelegramAccess: vi.fn(),
  unpinCanonicalCityActivity: vi.fn(),
  unpinDueCanonicalCityActivities: vi.fn(),
}));

vi.mock("./activity-share-card-storage.js", () => ({
  ensureActivitySharePublicAlias: vi.fn(),
  persistActivityShareCard: vi.fn(),
}));

vi.mock("./telegram-event-card.js", () => ({
  buildTelegramEventCard: vi.fn(),
}));

vi.mock("./telegram-share-card-token.js", () => ({
  createTelegramShareCardToken: vi.fn(),
}));

vi.mock("./telegram-share-event.js", () => ({
  loadTrustedTelegramEventCard: vi.fn(),
}));

import { publishCanonicalCityActivity } from "./telegram-city-publication.js";

describe("city Telegram publication wrapper", () => {
  beforeEach(() => {
    publishCanonicalCityActivityBase.mockReset();
  });

  it("publishes without managing the General forum topic", async () => {
    publishCanonicalCityActivityBase.mockImplementation(async ({ telegramApi }: { telegramApi: TelegramApi }) => {
      const message = await telegramApi<{ message_id: number }>("sendPhoto", {
        chat_id: -1003919911341,
        photo: "https://example.test/card.jpg",
      });
      return { published: true, reused: false, chatId: -1003919911341, messageId: message.message_id };
    });

    const telegramApi = vi.fn(async (method: string) => {
      if (method === "sendPhoto") return { message_id: 77 };
      throw new Error(`unexpected_${method}`);
    });

    await expect(publishCanonicalCityActivity({
      supabase: {} as never,
      telegramApi,
      botToken: "bot-token",
      activityId: "activity-id",
      language: "ru",
    })).resolves.toEqual({
      published: true,
      reused: false,
      chatId: -1003919911341,
      messageId: 77,
      mediaUnchanged: true,
      pinned: false,
    });

    expect(telegramApi).toHaveBeenCalledWith("sendPhoto", {
      chat_id: -1003919911341,
      photo: "https://example.test/card.jpg",
    });
    expect(telegramApi).not.toHaveBeenCalledWith("reopenGeneralForumTopic", expect.anything());
    expect(telegramApi).not.toHaveBeenCalledWith("closeGeneralForumTopic", expect.anything());
  });
});