import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("telegramEventSupergroup create_binding", () => {
  it("does not call Telegram webhook setup during organizer handshake", () => {
    const source = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );
    const organizerCheck = source.indexOf('return json({ error: "organizer_required" }, 403);');
    const tokenCreation = source.indexOf("const bindingToken = base64UrlEncode", organizerCheck);

    expect(organizerCheck).toBeGreaterThan(-1);
    expect(tokenCreation).toBeGreaterThan(organizerCheck);

    const createBindingHandshake = source.slice(organizerCheck, tokenCreation);
    expect(createBindingHandshake).not.toContain("ensureTelegramWebhook");
    expect(createBindingHandshake).not.toContain("getWebhookInfo");
    expect(createBindingHandshake).not.toContain("setWebhook");
  });
});

describe("telegramEventSupergroup webhook binding", () => {
  it("falls back to the sender's single pending binding when Telegram drops startgroup payload", () => {
    const source = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("resolvePendingBinding");
    expect(source).toContain('parseBareStart(message?.text, botUsername)');
    expect(source).toContain('.eq("requested_by_user_key", senderUserKey)');
    expect(source).toContain('.is("consumed_at", null)');
    expect(source).toContain('.gt("expires_at", new Date().toISOString())');
    expect(source).toContain('return json({ ok: true, rejected: "binding_ambiguous" });');
  });
});
