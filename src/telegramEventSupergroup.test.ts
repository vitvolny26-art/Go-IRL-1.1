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
  createEventSupergroupBinding,
  getEventSupergroupWebhookInfo,
  openEventSupergroupBinding,
} from "./telegramEventSupergroup";

describe("event Telegram supergroup handshake", () => {
  beforeEach(() => {
    getTrustedAccessToken.mockReset();
    getTrustedAccessToken.mockResolvedValue("trusted-jwt");
    openTelegramLink.mockReset();
    vi.restoreAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  });

  it("requests an event-bound startgroup token with WebView-safe headers", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      startGroupUrl: "https://t.me/GOirl_bot?startgroup=abcdefghijklmnopqrstuvwxyz_123456",
      expiresAt: "2026-07-28T18:00:00.000Z",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(createEventSupergroupBinding("f8aa4975-acde-4d58-a247-3be70f2fcf73")).resolves.toEqual({
      startGroupUrl: "https://t.me/GOirl_bot?startgroup=abcdefghijklmnopqrstuvwxyz_123456",
      expiresAt: "2026-07-28T18:00:00.000Z",
    });
    expect(request).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/telegramEventSupergroup",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer trusted-jwt",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_binding",
          activityId: "f8aa4975-acde-4d58-a247-3be70f2fcf73",
        }),
      },
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
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ webhook }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(getEventSupergroupWebhookInfo("activity-id")).resolves.toEqual(webhook);
    expect(request).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/telegramEventSupergroup",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer trusted-jwt",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "get_webhook_info", activityId: "activity-id" }),
      },
    );
  });

  it("rejects malformed webhook diagnostic responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      webhook: { url: "https://project.supabase.co/functions/v1/telegramEventSupergroup" },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(getEventSupergroupWebhookInfo("activity-id")).rejects.toThrow("invalid_webhook_info_response");
  });

  it("requires a trusted session before requesting a binding", async () => {
    getTrustedAccessToken.mockResolvedValue(null);
    const request = vi.spyOn(globalThis, "fetch");

    await expect(createEventSupergroupBinding("activity-id")).rejects.toThrow("trusted_auth_required");
    expect(request).not.toHaveBeenCalled();
  });

  it("surfaces a server binding error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: "telegram_webhook_conflict",
    }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(createEventSupergroupBinding("activity-id")).rejects.toThrow("telegram_webhook_conflict");
  });

  it("rejects an untrusted binding URL", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      startGroupUrl: "https://evil.example/startgroup=abcdefghijklmnopqrstuvwxyz_123456",
      expiresAt: "2026-07-28T18:00:00.000Z",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(createEventSupergroupBinding("activity-id")).rejects.toThrow("invalid_supergroup_binding_response");
  });

  it("opens only a validated startgroup URL", () => {
    const url = "https://t.me/GOirl_bot?startgroup=abcdefghijklmnopqrstuvwxyz_123456";
    expect(openEventSupergroupBinding(url)).toBe(true);
    expect(openTelegramLink).toHaveBeenCalledWith(url);
    expect(openEventSupergroupBinding("https://t.me/GOirl_bot?startgroup=short")).toBe(false);
  });
});
