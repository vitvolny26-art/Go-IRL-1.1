import { describe, expect, it } from "vitest";
import { providerFromWebhookPath } from "./provider-webhook-route.js";

describe("provider webhook dynamic route", () => {
  it.each([
    ["/api/instagram/webhook", "instagram"],
    ["/api/messenger/webhook", "messenger"],
    ["/api/whatsapp/webhook", "whatsapp"],
  ] as const)("routes %s to %s", (pathname, provider) => {
    expect(providerFromWebhookPath(pathname)).toBe(provider);
  });

  it.each([
    "/api/telegram/webhook",
    "/api/instagram/messages",
    "/instagram/webhook",
    "/api/instagram/webhook/extra",
  ])("rejects unsupported path %s", (pathname) => {
    expect(providerFromWebhookPath(pathname)).toBeNull();
  });
});
