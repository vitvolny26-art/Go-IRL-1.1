import { describe, expect, it } from "vitest";
import {
  createWebProviderTrustedSession,
  normalizeTelegramTrustedSession,
} from "./providerTrustedSession";

describe("provider trusted session contract", () => {
  it("normalizes the existing Telegram identity without changing its user key", () => {
    expect(normalizeTelegramTrustedSession({
      accessToken: "telegram-jwt",
      expiresAt: 2000,
      user: {
        id: "app-user-id",
        userKey: "telegram:12345",
        telegramId: 12345,
        firstName: "Vit",
        role: "admin",
      },
    }, 1000)).toEqual({
      accessToken: "telegram-jwt",
      expiresAt: 2000,
      user: {
        id: "app-user-id",
        userKey: "telegram:12345",
        provider: "telegram",
        providerUserId: "12345",
        telegramId: 12345,
        firstName: "Vit",
        lastName: null,
        username: null,
        role: "admin",
      },
      source: "trusted-provider",
    });
  });

  it("creates a provider-neutral Google session only from an already bootstrapped GO IRL identity", () => {
    expect(createWebProviderTrustedSession({
      accessToken: "go-irl-jwt",
      expiresAt: 2000,
      user: {
        id: "app-user-id",
        userKey: "user:canonical-id",
        provider: "google",
        providerUserId: "google-sub",
        firstName: "Vit",
        role: "user",
      },
    }, 1000).user).toMatchObject({
      provider: "google",
      providerUserId: "google-sub",
      userKey: "user:canonical-id",
    });
  });

  it("creates a Facebook session without changing the canonical GO IRL user key", () => {
    expect(createWebProviderTrustedSession({
      accessToken: "go-irl-jwt",
      expiresAt: 2000,
      user: {
        id: "app-user-id",
        userKey: "telegram:12345",
        provider: "facebook",
        providerUserId: "facebook-user-id",
        firstName: "Vit",
        role: "user",
      },
    }, 1000).user).toMatchObject({
      provider: "facebook",
      providerUserId: "facebook-user-id",
      userKey: "telegram:12345",
    });
  });

  it("fails closed for stale or incomplete sessions", () => {
    expect(() => normalizeTelegramTrustedSession({
      accessToken: "",
      expiresAt: 2000,
      user: { id: "id", userKey: "telegram:1", telegramId: 1, role: "user" },
    }, 1000)).toThrow("invalid_trusted_session:accessToken");

    expect(() => createWebProviderTrustedSession({
      accessToken: "jwt",
      expiresAt: 1050,
      user: { id: "id", userKey: "user:1", provider: "google", providerUserId: "sub", role: "user" },
    }, 1000)).toThrow("invalid_trusted_session:expiresAt");
  });
});
