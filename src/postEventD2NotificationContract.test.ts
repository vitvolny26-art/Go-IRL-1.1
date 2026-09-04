/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { notificationRegistryByKind } from "./notifications/contracts";
import { buildEventNotificationText } from "./notifications/message-builder";
import { legacyEventNotificationKindMap } from "./notifications/service-contracts";
import type { EventNotificationDelivery } from "./notifications/types";

const serverTypes = readFileSync(new URL("../server/notifications/types.ts", import.meta.url), "utf8");
const serverContracts = readFileSync(new URL("../server/notifications/contracts.ts", import.meta.url), "utf8");
const serverServiceContracts = readFileSync(new URL("../server/notifications/service-contracts.ts", import.meta.url), "utf8");
const serverMessageBuilder = readFileSync(new URL("../server/notifications/message-builder.ts", import.meta.url), "utf8");
const dispatcher = readFileSync(new URL("./notifications/dispatcher.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("./notifications/repository.ts", import.meta.url), "utf8");

const delivery = (
  kind: "post_event.organizer_confirmation" | "post_event.participant_confirmation",
  postEventStage: "organizer_initial" | "organizer_reminder1" | "participant_confirmation",
): EventNotificationDelivery => ({
  id: `postevent-${postEventStage}`,
  userKey: "user:1",
  activityId: "activity-1",
  kind,
  payload: {
    eventId: "activity-1",
    feedbackId: kind === "post_event.participant_confirmation" ? "feedback-1" : undefined,
    postEventStage,
    eventDate: "2026-09-01",
    eventTime: "18:30:00",
    eventTimezone: "Europe/Prague",
  },
  attemptCount: 1,
  provider: "telegram",
  recipientId: "123",
  language: "ru",
  openUrl: "https://go-irl.fun/join/activity-1",
});

describe("POSTEVENT001 D2 application notification contract", () => {
  it("registers both D1 outbox kinds as non-critical post-event notifications", () => {
    expect(notificationRegistryByKind.get("post_event.organizer_confirmation")).toMatchObject({
      category: "post_event",
      serviceCritical: false,
      defaultChannels: ["in_app", "telegram"],
      retentionDays: 14,
    });
    expect(notificationRegistryByKind.get("post_event.participant_confirmation")).toMatchObject({
      category: "post_event",
      serviceCritical: false,
      defaultChannels: ["in_app", "telegram"],
      retentionDays: 14,
    });
  });

  it("maps the existing event outbox kinds to the canonical registry", () => {
    expect(legacyEventNotificationKindMap["post_event.organizer_confirmation"]).toBe("post_event.organizer_confirmation");
    expect(legacyEventNotificationKindMap["post_event.participant_confirmation"]).toBe("post_event.participant_confirmation");
  });

  it("renders organizer initial and reminder stages from D1 payload fields", () => {
    const initial = buildEventNotificationText(delivery("post_event.organizer_confirmation", "organizer_initial"));
    const reminder = buildEventNotificationText(delivery("post_event.organizer_confirmation", "organizer_reminder1"));
    expect(initial).toContain("Подтвердите событие");
    expect(initial).toContain("2026-09-01 · 18:30");
    expect(initial).toContain("Состоялось ли это событие?");
    expect(reminder).toContain("Напоминание: подтвердите событие");
  });

  it("renders participant confirmation from the same D1 payload contract", () => {
    const text = buildEventNotificationText(delivery("post_event.participant_confirmation", "participant_confirmation"));
    expect(text).toContain("Подтвердите участие");
    expect(text).toContain("2026-09-01 · 18:30");
    expect(text).toContain("Вы были на этом событии?");
  });

  it("keeps server notification contracts in parity for the new D2 kinds", () => {
    for (const source of [serverTypes, serverContracts, serverServiceContracts, serverMessageBuilder]) {
      expect(source).toContain("post_event.organizer_confirmation");
      expect(source).toContain("post_event.participant_confirmation");
    }
    expect(serverTypes).toContain("postEventStage");
    expect(serverTypes).toContain("eventTimezone");
    expect(serverMessageBuilder).toContain("delivery.payload.eventDate");
  });

  it("reuses the existing activity deep-link path without adding D3 callback behavior", () => {
    expect(repository).toContain('payload.eventId || activityId || ""');
    expect(dispatcher).toContain('messageDelivery.payload.eventId || messageDelivery.activityId || ""');
    expect(dispatcher).not.toContain("callback_data");
  });
});
