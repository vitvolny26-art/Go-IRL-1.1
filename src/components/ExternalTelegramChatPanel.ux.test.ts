import { describe, expect, it } from "vitest";
import panelSource from "./ExternalTelegramChatPanel.tsx?raw";

describe("external Telegram chat UX", () => {
  it("describes the supported existing-group binding flow", () => {
    expect(panelSource).toContain("Привязать существующую группу");
    expect(panelSource).toContain("Новую группу нужно сначала создать вручную");
    expect(panelSource).toContain("Проверить привязку");
  });

  it("keeps retry available and removes clipboard automation", () => {
    expect(panelSource).toContain('awaitingBinding ? "Выбрать другую группу"');
    expect(panelSource).not.toContain("disabled={saving || awaitingBinding}");
    expect(panelSource).not.toContain("navigator.clipboard");
    expect(panelSource).not.toContain("ClipboardPaste");
  });

  it("exposes only the safe organizer webhook diagnostic while binding is pending", () => {
    expect(panelSource).toContain("Диагностика webhook");
    expect(panelSource).toContain('data-testid="telegram-webhook-diagnostic"');
    expect(panelSource).toContain("pending_update_count");
    expect(panelSource).toContain("allowed_updates");
  });

  it("lets the organizer configure the webhook through the trusted in-app session", () => {
    expect(panelSource).toContain("Настроить webhook");
    expect(panelSource).toContain("setEventSupergroupWebhook");
    expect(panelSource).toContain("settingWebhook");
    expect(panelSource).toContain("Если текущая привязка началась до настройки, выберите группу заново");
  });

  it("keeps safe webhook status visible after a setup failure", () => {
    expect(panelSource).toContain("Webhook: {webhookDiagnostic.url ? \"настроен\" : \"не настроен\"}");
    expect(panelSource).toContain("const diagnostic = await getEventSupergroupWebhookInfo(activity.id)");
    expect(panelSource).toContain("Не удалось настроить Telegram webhook. Текущий статус показан ниже.");
    expect(panelSource).toContain("external-telegram-chat-webhook-status");
  });
});
