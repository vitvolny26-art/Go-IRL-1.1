import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { EventNotificationDispatcher } from "./notifications/dispatcher";
import { buildOrganizerJoinAlertText } from "./notifications/organizer-join-alert";
import { buildEventNotificationTelegramReplyMarkup } from "./notifications/telegram-reply-markup";
import type { EventNotificationDelivery } from "./notifications/types";

const migration = readFileSync(
  new URL("../supabase/migrations/20260912140000_chrem002c_organizer_rolling_join_alert.sql", import.meta.url),
  "utf8",
);

const delivery = (overrides: Partial<EventNotificationDelivery> = {}): EventNotificationDelivery => ({
  id: "notification-1",
  userKey: "telegram:organizer",
  activityId: "11111111-1111-1111-1111-111111111111",
  kind: "activity.organizer_join_alert",
  payload: {
    eventId: "11111111-1111-1111-1111-111111111111",
    participantName: "Anna",
    joinedCount: 2,
    capacity: 8,
    previousTelegramMessageId: "41",
  },
  attemptCount: 1,
  provider: "telegram",
  recipientId: "9001",
  language: "en",
  openUrl: "https://go-irl.fun/join/11111111-1111-1111-1111-111111111111",
  ...overrides,
});

describe("ChRem002C organizer rolling join alert", () => {
  it("renders six-language rolling copy without Telegram buttons", () => {
    expect(buildOrganizerJoinAlertText(delivery())).toBe(
      "👋 Anna joined your event.\nParticipants: 2/8",
    );
    expect(buildOrganizerJoinAlertText(delivery({ language: "cs" }))).toContain("Účastníci: 2/8");
    expect(buildOrganizerJoinAlertText(delivery({ language: "ru" }))).toContain("Участники: 2/8");
    expect(buildOrganizerJoinAlertText(delivery({ language: "uk" }))).toContain("Учасники: 2/8");
    expect(buildOrganizerJoinAlertText(delivery({ language: "pl" }))).toContain("Uczestnicy: 2/8");
    expect(buildOrganizerJoinAlertText(delivery({ language: "sk" }))).toContain("Účastníci: 2/8");
    expect(buildEventNotificationTelegramReplyMarkup(delivery(), delivery().openUrl))
      .toEqual({ inline_keyboard: [] });
  });

  it("best-effort deletes the prior Telegram message before replacement", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ ok: false }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 42 } }) });
    const dispatcher = new EventNotificationDispatcher({
      telegramBotToken: "token",
      graphVersion: "v23.0",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(dispatcher.send(delivery())).resolves.toEqual({
      status: "sent",
      providerMessageId: "42",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/deleteMessage");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/sendMessage");
  });

  it("reuses the canonical outbox with real joined-transition and rolling guards", () => {
    expect(migration).toContain("activity_members_queue_organizer_join_alert");
    expect(migration).toContain("new.status <> 'joined'");
    expect(migration).toContain("old.status = 'joined'");
    expect(migration).toContain("member.user_key <> v_activity.organizer_key");
    expect(migration).toContain("activity.organizer_join_alert_private_telegram_unavailable");
    expect(migration).toContain("v_definition := regexp_replace(");
    expect(migration).toContain("chrem002c_notification_claim_kind_lists_shape_changed");
    expect(migration).toContain("'rollingPending', true");
    expect(migration).toContain("'previousTelegramMessageId'");
    expect(migration).not.toContain("create table");
  });
});
