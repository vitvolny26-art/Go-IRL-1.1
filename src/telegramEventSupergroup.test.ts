import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTrustedAccessToken, openTelegramLink } = vi.hoisted(() => ({
  getTrustedAccessToken: vi.fn(),
  openTelegramLink: vi.fn(),
}));

vi.mock("./authSession", () => ({
  getTrustedAccessToken,
}));

vi.mock("./telegram", () => ({
  getTelegramWebApp: () => ({ openTelegramLink }),
}));

import {
  createEventForumTopic,
  createEventSupergroupBinding,
  getEventSupergroupWebhookInfo,
  openEventSupergroupBinding,
  setEventSupergroupWebhook,
} from "./telegramEventSupergroup";

describe("event Telegram supergroup handshake", () => {
  beforeEach(() => {
    getTrustedAccessToken.mockReset();
    getTrustedAccessToken.mockResolvedValue("trusted-jwt");
    openTelegramLink.mockReset();
    vi.restoreAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  });

  it("creates an event forum topic through the trusted organizer session", async () => {
    const topic = {
      inviteUrl: "https://t.me/+AbC_123-xyz",
      topicUrl: "https://t.me/c/1234567890/42",
      messageThreadId: 42,
      title: "Volleyball",
      deleteAfter: "2026-08-25T18:00:00.000Z",
    };
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ topic }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(createEventForumTopic("activity-id")).resolves.toEqual(topic);
    expect(request).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/telegramEventSupergroup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "create_topic", activityId: "activity-id" }),
      }),
    );
  });

  it("rejects malformed forum-topic responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      topic: { topicUrl: "https://evil.example/topic" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(createEventForumTopic("activity-id")).rejects.toThrow("invalid_event_forum_topic_response");
  });

  it("requests an event-bound startgroup token with WebView-safe headers", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      startGroupUrl: "https://t.me/GOirl_bot?startgroup=abcdefghijklmnopqrstuvwxyz_123456",
      expiresAt: "2026-07-28T18:00:00.000Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(createEventSupergroupBinding("f8aa4975-acde-4d58-a247-3be70f2fcf73")).resolves.toEqual({
      startGroupUrl: "https://t.me/GOirl_bot?startgroup=abcdefghijklmnopqrstuvwxyz_123456",
      expiresAt: "2026-07-28T18:00:00.000Z",
    });
    expect(request).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/telegramEventSupergroup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "create_binding", activityId: "f8aa4975-acde-4d58-a247-3be70f2fcf73" }),
      }),
    );
  });

  it("requests sanitized Telegram webhook metadata with the trusted organizer session", async () => {
    const webhook = {
      url: "https://project.supabase.co/functions/v1/telegramEventSupergroup",
      has_custom_certificate: false,
      pending_update_count: 2,
      last_error_date: 1_787_510_000,
      last_error_message: "Bad Request: webhook delivery failed",
      last_synchronization_error_date: null,
      max_connections: 40,
      allowed_updates: ["message"],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ webhook }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(getEventSupergroupWebhookInfo("activity-id")).resolves.toEqual(webhook);
  });

  it("sets the Telegram webhook with the trusted organizer session and returns sanitized metadata", async () => {
    const webhook = {
      url: "https://project.supabase.co/functions/v1/telegramEventSupergroup",
      has_custom_certificate: false,
      pending_update_count: 0,
      last_error_date: null,
      last_error_message: null,
      last_synchronization_error_date: null,
      max_connections: 40,
      allowed_updates: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ webhook }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(setEventSupergroupWebhook("activity-id")).resolves.toEqual(webhook);
  });

  it("requires a trusted session before protected actions", async () => {
    getTrustedAccessToken.mockResolvedValue(null);
    const request = vi.spyOn(globalThis, "fetch");
    await expect(createEventForumTopic("activity-id")).rejects.toThrow("trusted_auth_required");
    await expect(setEventSupergroupWebhook("activity-id")).rejects.toThrow("trusted_auth_required");
    await expect(createEventSupergroupBinding("activity-id")).rejects.toThrow("trusted_auth_required");
    expect(request).not.toHaveBeenCalled();
  });

  it("opens only a validated startgroup URL", () => {
    const url = "https://t.me/GOirl_bot?startgroup=abcdefghijklmnopqrstuvwxyz_123456";
    expect(openEventSupergroupBinding(url)).toBe(true);
    expect(openTelegramLink).toHaveBeenCalledWith(url);
    expect(openEventSupergroupBinding("https://t.me/GOirl_bot?startgroup=short")).toBe(false);
  });
});