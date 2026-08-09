import { describe, expect, it } from "vitest";
import {
  createWebProviderTrustedSession,
  normalizeTelegramTrustedSession,
} from "./providerTrustedSession";

describe("provider trusted session contract", () => {
  it("keeps Telegram delivery identity only where Telegram runtime still requires it", () => {
    const session = normalizeTelegramTrustedSession({
      accessToken: "telegram-jwt",
      expiresAt: 2000,
      user: {
        id: "app-user-id",
        userKey: "telegram:12345",
        telegramId: 12345,
        firstName: "Vit",
        role: "admin",
      },
    }, 1000);
    expect(session.user).toMatchObject({
      id: "app-user-id",
      userKey: "telegram:12345",
      provider: "telegram",
      telegramId: 12345,
      role: "admin",
    });
    expect(session.user).not.toHaveProperty("providerUserId");
  });

  it("creates a web session without retaining provider subject or provider profile data", () => {
    const session = createWebProviderTrustedSession({
      accessToken: "go-irl-jwt",
      expiresAt: 2000,
      user: {
        id: "app-user-id",
        userKey: "user:canonical-id",
        provider: "google",
        role: "user",
      },
    }, 1000);
    expect(session.user).toEqual({
      id: "app-user-id",
      userKey: "user:canonical-id",
      provider: "google",
      role: "user",
    });
  });

  it("creates a Facebook session without exposing the external Facebook subject", () => {
    const session = createWebProviderTrustedSession({
      accessToken: "go-irl-jwt",
      expiresAt: 2000,
      user: {
        id: "app-user-id",
        userKey: "telegram:12345",
        provider: "facebook",
        role: "user",
      },
    }, 1000);
    expect(session.user).toEqual({
      id: "app-user-id",
      userKey: "telegram:12345",
      provider: "facebook",
      role: "user",
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
      user: { id: "id", userKey: "user:1", provider: "google", role: "user" },
    }, 1000)).toThrow("invalid_trusted_session:expiresAt");
  });
});
