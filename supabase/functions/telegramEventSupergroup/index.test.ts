import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("telegramEventSupergroup create_binding", () => {
  it("does not call Telegram webhook setup during organizer handshake", () => {
    const source = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );
    const tokenCreation = source.indexOf("const bindingToken = base64UrlEncode");
    const bindingResponse = source.indexOf("startGroupUrl:", tokenCreation);

    expect(tokenCreation).toBeGreaterThan(-1);
    expect(bindingResponse).toBeGreaterThan(tokenCreation);

    const createBindingHandshake = source.slice(tokenCreation, bindingResponse);
    expect(createBindingHandshake).not.toContain("ensureTelegramWebhook");
    expect(createBindingHandshake).not.toContain("getWebhookInfo");
    expect(createBindingHandshake).not.toContain("setWebhook");
  });
});

describe("telegramEventSupergroup webhook diagnostic", () => {
  it("requires organizer auth and returns only sanitized Telegram webhook metadata", () => {
    const source = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );
    const organizerCheck = source.indexOf('return json({ error: "organizer_required" }, 403);');
    const diagnosticStart = source.indexOf('if (body.action === "get_webhook_info")');
    const tokenCreation = source.indexOf("const bindingToken = base64UrlEncode", diagnosticStart);

    expect(source).toContain('new Set(["create_binding", "get_webhook_info"])');
    expect(organizerCheck).toBeGreaterThan(-1);
    expect(diagnosticStart).toBeGreaterThan(organizerCheck);
    expect(tokenCreation).toBeGreaterThan(diagnosticStart);

    const diagnosticBlock = source.slice(diagnosticStart, tokenCreation);
    expect(diagnosticBlock).toContain('telegramApi<TelegramWebhookInfo>(botToken, "getWebhookInfo")');
    expect(diagnosticBlock).toContain("sanitizeWebhookInfo(webhookInfo, botToken)");
    expect(diagnosticBlock).not.toContain("setWebhook");
    expect(source).toContain('value.replaceAll(botToken, "[REDACTED]")');
    expect(source).toContain("pending_update_count");
    expect(source).toContain("last_error_message");
    expect(source).toContain("allowed_updates");
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
