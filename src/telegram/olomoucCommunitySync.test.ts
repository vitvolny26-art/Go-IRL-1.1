import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildOlomoucCommunityMessage,
  olomoucActivityEndsAt,
  resolveOlomoucCommunityTopicId,
  syncOlomoucCommunityActivities,
  type OlomoucCommunityActivity,
} from "./olomoucCommunitySync";

const activity = (overrides: Partial<OlomoucCommunityActivity> = {}): OlomoucCommunityActivity => ({
  id: "3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  category_id: "sport",
  activity_ru: "Волейбол",
  activity_cs: "Volejbal",
  title_ru: "Волейбол после работы",
  title_cs: "Volejbal po práci",
  description_ru: "",
  description_cs: "",
  event_date: "2026-09-02",
  event_time: "18:30:00",
  city_id: "olomouc",
  address: "Smetanovy sady, Olomouc",
  price: 0,
  visibility: "public",
  metadata: { sport: { durationMinutes: 90 } },
  ...overrides,
});

const stateSecret = "test-state-secret";
const signature = (activityId: string, post: { chatId: number; topicId: number; messageId: number; postedAt: string }) =>
  createHmac("sha256", stateSecret)
    .update([activityId, post.chatId, post.topicId, post.messageId, post.postedAt].join(":"))
    .digest("hex");

describe("Olomouc Telegram community sync", () => {
  it("interprets Olomouc event time in Europe/Prague on UTC workers", () => {
    expect(olomoucActivityEndsAt(activity({
      event_date: "2026-09-01",
      event_time: "10:00:00",
      metadata: { sport: { durationMinutes: 60 } },
    }))?.toISOString()).toBe("2026-09-01T09:00:00.000Z");
  });

  it("routes activities to the configured Czech topics", () => {
    expect(resolveOlomoucCommunityTopicId(activity())).toBe(5);
    expect(resolveOlomoucCommunityTopicId(activity({ category_id: "party", title_cs: "Hudební večírek" }))).toBe(3);
    expect(resolveOlomoucCommunityTopicId(activity({ category_id: "activities", title_cs: "Deskové hry" }))).toBe(8);
    expect(resolveOlomoucCommunityTopicId(activity({ category_id: "social", title_cs: "Jazyková výměna" }))).toBe(7);
    expect(resolveOlomoucCommunityTopicId(activity({ category_id: "nature", title_cs: "Výlet" }))).toBe(6);
    expect(resolveOlomoucCommunityTopicId(activity({ category_id: "creativity", title_cs: "Výstava" }))).toBe(4);
    expect(resolveOlomoucCommunityTopicId(activity({ category_id: "social", title_cs: "Kam s dětmi" }))).toBe(9);
  });

  it("builds every Telegram activity post in Czech and Russian", () => {
    const text = buildOlomoucCommunityMessage(activity(), "https://t.me/GOirl_bot?startapp=event");
    expect(text).toContain("🇨🇿 Nová aktivita v Olomouci");
    expect(text).toContain("Volejbal po práci");
    expect(text).toContain("🇷🇺 Новая активность в Оломоуце");
    expect(text).toContain("Волейбол после работы");
    expect(text).toContain("02.09.2026 · 18:30");
  });

  it("posts, pins and persists a new public event", async () => {
    const saveMetadata = vi.fn();
    const telegram = {
      sendMessage: vi.fn().mockResolvedValue(321),
      pinMessage: vi.fn().mockResolvedValue(undefined),
      unpinMessage: vi.fn().mockResolvedValue(undefined),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };

    const result = await syncOlomoucCommunityActivities(
      { listActivities: async () => [activity()], saveMetadata },
      telegram,
      { now: new Date("2026-09-01T12:00:00+02:00"), stateSecret },
    );

    expect(result).toMatchObject({ posted: 1, removed: 0 });
    expect(telegram.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ chatId: -1004451765209, topicId: 5 }));
    expect(telegram.pinMessage).toHaveBeenCalledWith(-1004451765209, 321);
    expect(saveMetadata).toHaveBeenCalledWith(activity().id, expect.objectContaining({
      telegramCommunity: expect.objectContaining({ messageId: 321, topicId: 5 }),
    }));
  });

  it("unpins and deletes a tracked message after the event ends", async () => {
    const trackedPost = {
      chatId: -1004451765209,
      topicId: 5,
      messageId: 654,
      postedAt: "2026-08-31T12:00:00.000Z",
    };
    const tracked = activity({
      event_date: "2026-09-01",
      event_time: "10:00:00",
      metadata: {
        sport: { durationMinutes: 60 },
        telegramCommunity: {
          ...trackedPost,
          signature: signature("3b172dd9-d5e2-4328-86a4-d4107a6359fc", trackedPost),
        },
      },
    });
    const saveMetadata = vi.fn();
    const telegram = {
      sendMessage: vi.fn(),
      pinMessage: vi.fn(),
      unpinMessage: vi.fn().mockResolvedValue(undefined),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };

    const result = await syncOlomoucCommunityActivities(
      { listActivities: async () => [tracked], saveMetadata },
      telegram,
      { now: new Date("2026-09-01T12:00:00+02:00"), stateSecret },
    );

    expect(result).toMatchObject({ posted: 0, removed: 1 });
    expect(telegram.unpinMessage).toHaveBeenCalledWith(-1004451765209, 654);
    expect(telegram.deleteMessage).toHaveBeenCalledWith(-1004451765209, 654);
    expect(saveMetadata).toHaveBeenCalledWith(tracked.id, expect.objectContaining({
      telegramCommunity: expect.objectContaining({ messageId: 654, removedAt: expect.any(String) }),
    }));
  });

  it("never publishes a private event to the city group", async () => {
    const telegram = {
      sendMessage: vi.fn(),
      pinMessage: vi.fn(),
      unpinMessage: vi.fn(),
      deleteMessage: vi.fn(),
    };
    const result = await syncOlomoucCommunityActivities(
      { listActivities: async () => [activity({ visibility: "private" })], saveMetadata: vi.fn() },
      telegram,
      { now: new Date("2026-09-01T12:00:00+02:00"), stateSecret },
    );
    expect(result.skipped).toBe(1);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it("does not trust forged message ids from user-editable activity metadata", async () => {
    const telegram = {
      sendMessage: vi.fn(),
      pinMessage: vi.fn(),
      unpinMessage: vi.fn(),
      deleteMessage: vi.fn(),
    };
    const forged = activity({
      event_date: "2026-08-31",
      metadata: {
        telegramCommunity: {
          chatId: -1004451765209,
          topicId: 5,
          messageId: 999,
          postedAt: "2026-08-30T12:00:00.000Z",
          signature: "forged",
        },
      },
    });
    await syncOlomoucCommunityActivities(
      { listActivities: async () => [forged], saveMetadata: vi.fn() },
      telegram,
      { now: new Date("2026-09-01T12:00:00+02:00"), stateSecret },
    );
    expect(telegram.unpinMessage).not.toHaveBeenCalled();
    expect(telegram.deleteMessage).not.toHaveBeenCalled();
  });
});
