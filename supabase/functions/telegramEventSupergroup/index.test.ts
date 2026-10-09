import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildTelegramWebhookInspection,
  inspectCinemaCallbackIdentity,
} from "./telegramWebhookInspection";

const readWebhookSource = () => [
  readFileSync(new URL("./legacy.ts", import.meta.url), "utf8"),
  readFileSync(new URL("./index.ts", import.meta.url), "utf8"),
].join("\n");

describe("telegramEventSupergroup create_binding", () => {
  it("does not call Telegram webhook setup during organizer handshake", () => {
    const source = readWebhookSource();
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
    const source = readWebhookSource();

    expect(source).toContain('new Set(["create_binding", "create_topic", "prepare_chat_picker", "publish_city_activity", "get_webhook_info", "set_webhook"])');
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
    const source = readWebhookSource();
    const organizerCheck = source.indexOf('return json({ error: "organizer_required" }, 403);');
    const diagnosticStart = source.indexOf('if (body.action === "get_webhook_info")');
    const repairStart = source.indexOf('if (body.action === "set_webhook")', diagnosticStart);

    expect(source).toContain('new Set(["create_binding", "create_topic", "prepare_chat_picker", "publish_city_activity", "get_webhook_info", "set_webhook"])');
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
    const source = readWebhookSource();
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

describe("telegramEventSupergroup safe webhook ownership inspection", () => {
  it("returns bot identity and delivery metadata without leaking the token", () => {
    const token = "8675060027:super-secret";
    const inspection = buildTelegramWebhookInspection({
      id: 8675060027,
      is_bot: true,
      username: "@GoIRL_doc_bot",
    }, {
      url: `https://example.test/webhook/bot${token}`,
      allowed_updates: ["message", "callback_query"],
      pending_update_count: 3,
      last_error_date: 1791550000,
      last_error_message: `request for bot${token} failed`,
    }, token);

    expect(inspection.bot).toEqual({ id: 8675060027, is_bot: true, username: "GoIRL_doc_bot" });
    expect(inspection.webhook.allowed_updates).toContain("callback_query");
    expect(inspection.webhook.pending_update_count).toBe(3);
    expect(JSON.stringify(inspection)).not.toContain(token);
    expect(inspection.webhook.url).toContain("[REDACTED]");
    expect(inspection.webhook.last_error_message).toContain("[REDACTED]");
  });

  it("keeps inspection read-only and service-role gated", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const serviceRoleStart = source.indexOf("if (serviceRoleAuthorized && request.method === \"POST\")");
    const inspectionStart = source.indexOf('if (body.action === "inspect_telegram_webhook")', serviceRoleStart);
    const repairStart = source.indexOf('if (body.action === "repair_telegram_webhook")', inspectionStart);
    const inspectionBlock = source.slice(inspectionStart, repairStart);

    expect(serviceRoleStart).toBeGreaterThan(-1);
    expect(inspectionStart).toBeGreaterThan(serviceRoleStart);
    expect(repairStart).toBeGreaterThan(inspectionStart);
    expect(inspectionBlock).toContain('telegramApi<TelegramBotIdentity>(botToken, "getMe")');
    expect(inspectionBlock).toContain('telegramApi<TelegramWebhookInfo>(botToken, "getWebhookInfo")');
    expect(inspectionBlock).not.toContain("setWebhook");
    expect(inspectionBlock).not.toContain("deleteWebhook");
    expect(inspectionBlock).not.toContain("drop_pending_updates");
  });
});

describe("telegramEventSupergroup Cinema callback wrong-ingress guard", () => {
  const ownerId = "509799028";
  const validUuid = "57447934-fc38-4952-bd63-0a3e25d66102";

  const callback = (data: string, overrides: Record<string, unknown> = {}) => ({
    id: "callback-1",
    data,
    from: { id: Number(ownerId) },
    message: { chat: { id: Number(ownerId) }, message_id: 316 },
    ...overrides,
  });

  it("classifies probe and exact approve/skip callbacks without authorizing publication", () => {
    expect(inspectCinemaCallbackIdentity(callback("kino:probe"), ownerId)).toMatchObject({
      family: "cinema", action: "probe", rejected: null,
    });
    expect(inspectCinemaCallbackIdentity(callback(`kino:approve:${validUuid}`), ownerId)).toMatchObject({
      family: "cinema", action: "approve", candidateId: validUuid, rejected: null,
    });
    expect(inspectCinemaCallbackIdentity(callback(`kino:skip:${validUuid}`), ownerId)).toMatchObject({
      family: "cinema", action: "skip", candidateId: validUuid, rejected: null,
    });
  });

  it("rejects malformed UUID, foreign owner/chat, and missing message identity", () => {
    expect(inspectCinemaCallbackIdentity(callback("kino:approve:not-a-uuid"), ownerId)).toMatchObject({
      rejected: "callback_data_invalid", candidateId: "",
    });
    expect(inspectCinemaCallbackIdentity(callback(`kino:approve:${validUuid}`, { from: { id: 7 } }), ownerId)).toMatchObject({
      rejected: "owner_forbidden",
    });
    expect(inspectCinemaCallbackIdentity(callback(`kino:skip:${validUuid}`, {
      message: { chat: { id: 7 }, message_id: 316 },
    }), ownerId)).toMatchObject({ rejected: "owner_forbidden" });
    expect(inspectCinemaCallbackIdentity(callback("kino:probe", {
      message: { chat: { id: Number(ownerId) } },
    }), ownerId)).toMatchObject({ rejected: "message_identity_invalid" });
  });

  it("does not claim other callback families and acknowledges wrong-ingress callbacks without Telegram sends", () => {
    expect(inspectCinemaCallbackIdentity(callback("cpplan:event-id"), ownerId)).toEqual({ family: "other" });

    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const guardStart = source.indexOf("const cinemaCallback = inspectCinemaCallbackIdentity");
    const serviceRoleStart = source.indexOf("const secretKeys = readSupabaseSecretKeys", guardStart);
    const guardBlock = source.slice(guardStart, serviceRoleStart);
    expect(guardBlock).toContain('rejected: cinemaCallback.family === "cinema" ? "cinema_callback_wrong_ingress"');
    expect(guardBlock).toContain("status: 200");
    expect(guardBlock).not.toContain("sendMessage");
    expect(guardBlock).not.toContain("answerCallbackQuery");
    expect(source.indexOf("handleCityPostersPlanCallback")).toBeLessThan(guardStart);
    expect(source.indexOf("handleCommunicationVerificationCallback")).toBeLessThan(guardStart);
    expect(source.indexOf("handlePostEventCallback")).toBeLessThan(guardStart);
    expect(source.indexOf("handleRepeatPublicationCallback")).toBeLessThan(guardStart);
  });
});

describe("telegramEventSupergroup webhook binding", () => {
  it("falls back to the sender's single pending binding when Telegram drops startgroup payload", () => {
    const source = readWebhookSource();

    expect(source).toContain("resolvePendingBinding");
    expect(source).toContain('parseBareStart(message?.text, botUsername)');
    expect(source).toContain('.eq("requested_by_user_key", senderUserKey)');
    expect(source).toContain('.is("consumed_at", null)');
    expect(source).toContain('.gt("expires_at", new Date().toISOString())');
    expect(source).toContain('return json({ ok: true, rejected: "binding_ambiguous" });');
  });
});

describe("telegramEventSupergroup city publication proxy diagnostics", () => {
  it("persists bounded HTTP and network failures without changing proxy responses", () => {
    const source = readWebhookSource();
    const publishStart = source.indexOf('if (activityId && action === "publish_city_activity")');
    const unpinStart = source.indexOf('if (activityId && action === "unpin_city_activity")', publishStart);

    expect(publishStart).toBeGreaterThan(-1);
    expect(unpinStart).toBeGreaterThan(publishStart);

    const publishBlock = source.slice(publishStart, unpinStart);
    expect(source).toContain("const boundedProxyDiagnosticText =");
    expect(source).toContain("const writeCityPublicationProxyFailureAudit =");
    expect(source).toContain('action: "activity.city_telegram_publication_proxy_failed"');
    expect(source).toContain('console.error("city_activity_publish_proxy_audit_failed"');
    expect(publishBlock).toContain("response.clone().text()");
    expect(publishBlock).toContain('kind: "http_response"');
    expect(publishBlock).toContain("status: response.status");
    expect(publishBlock).toContain("response_body: responseBody");
    expect(publishBlock).toContain('kind: "network_exception"');
    expect(publishBlock).toContain("detail: auditDetail");
    expect(publishBlock).toContain("return jsonProxyResponse(response, request)");
    expect(publishBlock).toContain('error: "city_activity_publish_unavailable"');
  });
});
