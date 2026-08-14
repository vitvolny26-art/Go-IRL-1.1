import { describe, expect, it } from "vitest";
import { providerFromWebhookQuery } from "./provider-webhook-route.js";

describe("provider webhook query route", () => {
  it.each([
    ["instagram", "instagram"],
    ["messenger", "messenger"],
    ["whatsapp", "whatsapp"],
  ] as const)("routes provider=%s to %s", (value, provider) => {
    expect(providerFromWebhookQuery(value)).toBe(provider);
  });

  it.each([null, "", "telegram", "Instagram", "instagram/extra"])(
    "rejects unsupported provider %s",
    (value) => {
      expect(providerFromWebhookQuery(value)).toBeNull();
    },
  );
});
