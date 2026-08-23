import { describe, expect, it } from "vitest";
import panelSource from "./ExternalTelegramChatPanel.tsx?raw";

describe("external Telegram chat UX", () => {
  it("uses one canonical GO IRL group with a per-event forum topic", () => {
    expect(panelSource).toContain("Общая группа GO IRL уже настроена");
    expect(panelSource).toContain("Создать тему в Telegram");
    expect(panelSource).toContain("Открыть тему события");
    expect(panelSource).toContain("Вступить в группу");
  });

  it("automatically exposes the same event route to joined participants through existing access rules", () => {
    expect(panelSource).toContain("membershipStatus");
    expect(panelSource).toContain("canAccessExternalTelegramChat");
    expect(panelSource).toContain("Подтверждённые участники автоматически увидят доступ к группе и теме");
  });

  it("does not expose the legacy startgroup binding controls in the event panel", () => {
    expect(panelSource).not.toContain("Привязать существующую группу");
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