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

describe("telegramEventSupergroup native existing-chat picker", () => {
  it("prepares a Telegram picker without requiring organizer admin rights and binds chat_shared by request id", () => {
    const source = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain('new Set(["create_binding", "create_topic", "prepare_chat_picker", "get_webhook_info", "set_webhook"])');
    const prepareStart = source.indexOf('if (body.action === "prepare_chat_picker")');
    const createTopicStart = source.indexOf('if (body.action === "create_topic")', prepareStart);
    expect(prepareStart).toBeGreaterThan(-1);
    expect(createTopicStart).toBeGreaterThan(prepareStart);
    const prepareBlock = source.slice(prepareStart, createTopicStart);
    expect(prepareBlock).toContain('telegramApi<{ id: string }>(botToken, "savePreparedKeyboardButton"');
    expect(prepareBlock).toContain("chat_is_channel: false");
    expect(prepareBlock).toContain("request_title: true");
    expect(prepareBlock).toContain("request_username: true");
    expect(prepareBlock).not.toContain("user_administrator_rights");
    expect(prepareBlock).not.toContain("bot_administrator_rights");

    const pickerWebhookStart = source.indexOf("if (sharedChat && senderTelegramId");
    const legacyStart = source.indexOf("const token = parseBindingToken", pickerWebhookStart);
    expect(pickerWebhookStart).toBeGreaterThan(-1);
    expect(legacyStart).toBeGreaterThan(pickerWebhookStart);
    const pickerWebhookBlock = source.slice(pickerWebhookStart, legacyStart);
    expect(pickerWebhookBlock).toContain("pickerBindingTokenHash(senderTelegramId, requestId)");
    expect(pickerWebhookBlock).toContain('telegram_chat_id: selectedChatId');
    expect(pickerWebhookBlock).toContain('telegram_chat_type: selectedChatType');
    expect(pickerWebhookBlock).not.toContain("getChatMember");
    expect(pickerWebhookBlock).not.toContain("organizer_not_admin");
  });
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
    const repairStart = source.indexOf('if (body.action === "set_webhook")', diagnosticStart);

    expect(source).toContain('new Set(["create_binding", "create_topic", "prepare_chat_picker", "get_webhook_info", "set_webhook"])');
    expect(organizerCheck).toBeGreaterThan(-1);
    expect(diagnosticStart).toBeGreaterThan(organizerCheck);
    expect(repairStart).toBeGreaterThan(diagnosticStart);

    const diagnosticBlock = source.slice(diagnosticStart, repairStart);
    expect(diagnosticBlock).toContain('telegramApi<TelegramWebhookInfo>(botToken, "getWebhookInfo")');
    expect(diagnosticBlock).toContain("sanitizeWebhookInfo(webhookInfo, botToken)");
    expect(diagnosticBlock).not.toContain("setWebhook");
    expect(source).toContain('value.replaceAll(botToken, "[REDACTED]")');
    expect(source).toContain("pending_update_count");
    expect(source).toContain("last_error_message");
    expect(source).toContain("allowed_updates");
  });
});

describe("telegramEventSupergroup webhook repair", () => {
  it("uses existing runtime secrets, refuses conflicting URLs, drops stale updates once, and returns sanitized metadata", () => {
    const source = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );
    const organizerCheck = source.indexOf('return json({ error: "organizer_required" }, 403);');
    const repairStart = source.indexOf('if (body.action === "set_webhook")');
    const tokenCreation = source.indexOf("const bindingToken = base64UrlEncode", repairStart);

    expect(organizerCheck).toBeGreaterThan(-1);
    expect(repairStart).toBeGreaterThan(organizerCheck);
    expect(tokenCreation).toBeGreaterThan(repairStart);

    const repairBlock = source.slice(repairStart, tokenCreation);
    expect(repairBlock).toContain('`${supabaseUrl.replace(/\\/+$/, "")}/functions/v1/telegramEventSupergroup`');
    expect(repairBlock).toContain('telegramApi<TelegramWebhookInfo>(botToken, "getWebhookInfo")');
    expect(repairBlock).toContain('if (currentWebhookInfo.url === webhookUrl)');
    expect(repairBlock).toContain('if (currentWebhookInfo.url) throw new Error("telegram_webhook_conflict")');
    expect(repairBlock).toContain('telegramApi<boolean>(botToken, "setWebhook"');
    expect(repairBlock).toContain("url: webhookUrl");
    expect(repairBlock).toContain("secret_token: webhookSecret");
    expect(repairBlock).toContain("drop_pending_updates: true");
    expect(source).toContain('const isValidTelegramWebhookSecret = (value: string) => /^[A-Za-z0-9_-]{1,256}$/.test(value);');
    expect(repairBlock).toContain('return json({ error: "telegram_webhook_secret_invalid_format" }, 500);');
    expect(source).toContain('telegram_description: sanitizeTelegramErrorDescription(error.description)');
    expect(repairBlock).toContain("sanitizeWebhookInfo(webhookInfo, botToken)");
    expect(repairBlock).not.toContain("TELEGRAM_BOT_TOKEN");
    expect(repairBlock).not.toContain("TELEGRAM_WEBHOOK_SECRET");
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