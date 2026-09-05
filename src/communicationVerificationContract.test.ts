/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const handler = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/communicationVerification.ts", import.meta.url),
  "utf8",
);
const index = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url),
  "utf8",
);

describe("Telegram communication verification contract", () => {
  it("sends a consent request directly to an active candidate Telegram identity", () => {
    expect(handler).toContain('callback_data: `commverify:${route.id}`');
    expect(handler).toContain('identity.provider !== "telegram"');
    expect(handler).toContain('identity.status !== "active"');
    expect(handler).toContain('["identity_only", "candidate"].includes(route.readiness)');
    expect(handler).toContain('telegramApi<{ message_id: number }>("sendMessage"');
  });

  it("binds confirmation to the Telegram user who owns the exact route identity", () => {
    expect(handler).toContain('identity.provider_user_id !== String(telegramUserId)');
    expect(handler).toContain('identity.user_key !== route.user_key');
    expect(handler).toContain('route.channel !== "telegram"');
  });

  it("promotes only after the user presses the Telegram confirmation callback", () => {
    expect(handler).toContain("const consentTimestamp = identity.consented_at || new Date().toISOString()");
    expect(handler).toContain('supabase.rpc("go_irl_update_communication_route"');
    expect(handler).toContain('p_readiness: "ready"');
    expect(handler).toContain('p_consent_state: "granted"');
    expect(handler).toContain('p_action: "verified"');
  });

  it("does not silently select Telegram as the primary communication route", () => {
    expect(handler).not.toContain("go_irl_set_communication_preference");
    expect(handler).not.toContain("communication_preferences");
  });

  it("supports all six canonical UI languages for Telegram verification", () => {
    expect(handler).toContain('normalized.startsWith("uk")');
    expect(handler).toContain('normalized.startsWith("cs")');
    expect(handler).toContain('normalized.startsWith("en")');
    expect(handler).toContain('normalized.startsWith("pl")');
    expect(handler).toContain('normalized.startsWith("sk")');
    expect(handler).toContain('pl: {');
    expect(handler).toContain('sk: {');
    expect(handler).toContain('confirm: "Potwierdź Telegram"');
    expect(handler).toContain('confirm: "Potvrdiť Telegram"');
  });

  it("replaces a successful verification prompt with a short durable confirmation", () => {
    const helperStart = handler.indexOf("const replaceVerificationPrompt = async");
    const helperEnd = handler.indexOf("export const parseCommunicationVerificationCallback", helperStart);
    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);

    const helper = handler.slice(helperStart, helperEnd);
    const sendMessage = helper.indexOf('telegramApi<{ message_id: number }>("sendMessage"');
    const deleteMessage = helper.indexOf('telegramApi<boolean>("deleteMessage"');
    expect(sendMessage).toBeGreaterThan(-1);
    expect(deleteMessage).toBeGreaterThan(sendMessage);
    expect(helper).toContain("await removeKeyboard(telegramApi, callbackQuery)");

    const routeUpdate = handler.indexOf('const updateResult = await supabase.rpc("go_irl_update_communication_route"');
    const successAck = handler.indexOf("text: text.success", routeUpdate);
    const durableConfirmation = handler.indexOf(
      "await replaceVerificationPrompt(telegramApi, callbackQuery, text.confirmed)",
      successAck,
    );
    expect(successAck).toBeGreaterThan(routeUpdate);
    expect(durableConfirmation).toBeGreaterThan(successAck);
    expect(handler).toContain('confirmed: "Telegram подтверждён как канал связи."');
    expect(handler).toContain("await replaceVerificationPrompt(telegramApi, callbackQuery, text.already)");
  });

  it("keeps request dispatch behind the existing service-role boundary and callback handling behind the webhook boundary", () => {
    const serviceBoundary = index.indexOf("const serviceRoleAuthorized = safeEqual");
    const requestAction = index.indexOf('body.action === "send_communication_verification_requests"');
    const webhookBoundary = index.indexOf("const webhookAuthorized = safeEqual");
    const callbackAction = index.indexOf("const communicationVerificationResult = await handleCommunicationVerificationCallback");
    expect(serviceBoundary).toBeGreaterThan(-1);
    expect(requestAction).toBeGreaterThan(serviceBoundary);
    expect(webhookBoundary).toBeGreaterThan(-1);
    expect(callbackAction).toBeGreaterThan(webhookBoundary);
  });

  it("accepts Supabase secret API keys for server-side worker dispatch without removing legacy service-role auth", () => {
    expect(index).toContain('Deno.env.get("SUPABASE_SECRET_KEYS")');
    expect(index).toContain('request.headers.get("authorization")');
    expect(index).toContain('request.headers.get("apikey")');
    expect(index).toContain('secretKeys.some((key) => safeEqual(request.headers.get("apikey"), key))');
  });

  it("repairs the Telegram webhook without dropping pending updates and preserves callback delivery", () => {
    const serviceBoundary = index.indexOf("const serviceRoleAuthorized = safeEqual");
    const repairAction = index.indexOf('body.action === "repair_telegram_webhook"');
    const requestAction = index.indexOf('body.action === "send_communication_verification_requests"', repairAction);
    expect(serviceBoundary).toBeGreaterThan(-1);
    expect(repairAction).toBeGreaterThan(serviceBoundary);
    expect(requestAction).toBeGreaterThan(repairAction);

    const repairBlock = index.slice(repairAction, requestAction);
    expect(repairBlock).toContain('telegramApi<{');
    expect(repairBlock).toContain('(botToken, "getWebhookInfo")');
    expect(repairBlock).toContain('telegramApi<boolean>(botToken, "setWebhook"');
    expect(repairBlock).toContain("drop_pending_updates: false");
    expect(repairBlock).not.toContain("drop_pending_updates: true");
    expect(repairBlock).toContain('!currentAllowedUpdates.includes("callback_query")');
    expect(repairBlock).toContain('[...currentAllowedUpdates, "callback_query"]');
  });
});
