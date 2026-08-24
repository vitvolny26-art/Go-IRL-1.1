import { describe, expect, it } from "vitest";
import panelSource from "./ExternalTelegramChatPanel.tsx?raw";

describe("external Telegram chat UX", () => {
  it("offers a GO IRL forum topic or a native existing-chat picker", () => {
    expect(panelSource).toContain("Выберите Telegram-чат для события");
    expect(panelSource).toContain("Создать тему в Telegram");
    expect(panelSource).toContain("Привязать существующий чат");
    expect(panelSource).toContain("prepareEventChatPicker");
    expect(panelSource).toContain("requestTelegramChat");
    expect(panelSource).toContain("Организатору не нужны права администратора");
    expect(panelSource).toContain("Открыть тему события");
    expect(panelSource).toContain("Вступить в группу");
  });

  it("automatically exposes the selected event chat to joined participants through existing access rules", () => {
    expect(panelSource).toContain("membershipStatus");
    expect(panelSource).toContain("canAccessExternalTelegramChat");
    expect(panelSource).toContain("Подтверждённые участники автоматически увидят доступ к выбранному Telegram-чату");
  });

  it("does not restore manual URL entry or the legacy startgroup/admin binding controls", () => {
    expect(panelSource).not.toContain('placeholder="https://t.me/');
    expect(panelSource).not.toContain("saveSharedEventTelegramChatLink");
    expect(panelSource).not.toContain("Диагностика webhook");
    expect(panelSource).not.toContain("Настроить webhook");
    expect(panelSource).not.toContain("createEventSupergroupBinding");
  });

  it("surfaces only allowlisted Telegram topic diagnostic codes", () => {
    expect(panelSource).toContain("safeTopicErrorCodes");
    expect(panelSource).toContain("trusted_auth_required");
    expect(panelSource).toContain("telegram_get_chat_failed");
    expect(panelSource).toContain("telegram_create_chat_invite_link_failed");
    expect(panelSource).toContain("telegram_create_forum_topic_failed");
    expect(panelSource).toContain("topicErrorMessage(error)");
  });

  it("states the 24-hour lifecycle boundary without claiming the worker already exists", () => {
    expect(panelSource).toContain("Тема доступна до 24 часов после окончания события");
    expect(panelSource).toContain("должна быть удалена автоматическим lifecycle worker");
  });
});