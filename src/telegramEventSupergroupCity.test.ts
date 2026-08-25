import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTrustedAccessToken } = vi.hoisted(() => ({
  getTrustedAccessToken: vi.fn(),
}));

vi.mock("./authSession", () => ({ getTrustedAccessToken }));
vi.mock("./telegram", () => ({ getTelegramWebApp: () => undefined }));

import {
  createCityEventForumTopic,
  publishCityActivity,
  syncJoinedParticipantTelegramAccess,
  unpinCityActivity,
} from "./telegramEventSupergroup";

describe("city Telegram trusted actions", () => {
  beforeEach(() => {
    getTrustedAccessToken.mockReset();
    getTrustedAccessToken.mockResolvedValue("trusted-jwt");
    vi.restoreAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    localStorage.clear();
  });

  it("sends the current UI language for canonical city publication", async () => {
    localStorage.setItem("go-irl-language", "ru");
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ published: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await publishCityActivity("activity-id");
    expect(request).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/telegramEventSupergroup",
      expect.objectContaining({
        body: JSON.stringify({ action: "publish_city_activity", activityId: "activity-id", language: "ru" }),
      }),
    );
  });

  it("requests exact city-message unpin before activity deletion", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ unpinned: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await unpinCityActivity("activity-id");
    expect(request).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/telegramEventSupergroup",
      expect.objectContaining({
        body: JSON.stringify({ action: "unpin_city_activity", activityId: "activity-id" }),
      }),
    );
  });

  it("syncs access only through the joined-member action", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ prompted: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await syncJoinedParticipantTelegramAccess("activity-id", "user:member");
    expect(request).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/telegramEventSupergroup",
      expect.objectContaining({
        body: JSON.stringify({
          action: "sync_joined_telegram_access",
          activityId: "activity-id",
          memberUserKey: "user:member",
        }),
      }),
    );
  });

  it("creates a topic in the auto-bound public city chat", async () => {
    const topic = {
      inviteUrl: "https://t.me/+AbC_123-xyz",
      topicUrl: "https://t.me/c/1234567890/42",
      messageThreadId: 42,
      title: "Praha / Volleyball / 25.08.2026",
      deleteAfter: "2026-08-26T17:30:00.000Z",
    };
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ topic }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(createCityEventForumTopic("activity-id")).resolves.toEqual(topic);
    expect(request).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/telegramEventSupergroup",
      expect.objectContaining({
        body: JSON.stringify({ action: "create_city_topic", activityId: "activity-id" }),
      }),
    );
  });
});
