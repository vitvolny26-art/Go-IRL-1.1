/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEventNotificationText } from "./notifications/message-builder";
import { buildEventNotificationTelegramReplyMarkup } from "./notifications/telegram-reply-markup";
import type { EventNotificationDelivery } from "./notifications/types";
import { buildInAppPostEventContext } from "./postEventState";

const dispatcher = readFileSync(new URL("./notifications/dispatcher.ts", import.meta.url), "utf8");

const delivery = (language: EventNotificationDelivery["language"]): EventNotificationDelivery => ({
  id: "postevent-context",
  userKey: "user:1",
  activityId: "123e4567-e89b-42d3-a456-426614174000",
  kind: "post_event.organizer_confirmation",
  payload: {
    eventId: "123e4567-e89b-42d3-a456-426614174000",
    postEventStage: "organizer_initial",
    title: { cs: "Volejbal", ru: "Волейбол", uk: "Волейбол", en: "Volleyball" },
    eventDate: "2026-09-02",
    eventTime: "15:30:00",
    cityName: language === "cs" ? "Olomouc" : "Оломоуц",
  },
  attemptCount: 1,
  provider: "telegram",
  recipientId: "123",
  language,
  openUrl: "https://go-irl.fun/join/123e4567-e89b-42d3-a456-426614174000",
});

describe("POSTEVENT event context and recipient localization", () => {
  it("renders Czech event identity with date, time and city", () => {
    const text = buildEventNotificationText(delivery("cs"));
    expect(text).toContain("Potvrďte událost");
    expect(text).toContain("Volejbal");
    expect(text).toContain("2026-09-02 · 15:30");
    expect(text).toContain("Olomouc");
    expect(text).toContain("Proběhla tato událost?");
  });

  it("localizes Telegram organizer actions without changing callback data", () => {
    const item = delivery("cs");
    const markup = buildEventNotificationTelegramReplyMarkup(item, item.openUrl);
    const buttons = markup.inline_keyboard.flat();
    expect(buttons).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "Proběhla", callback_data: `pe:o:${item.activityId}:h` }),
      expect.objectContaining({ text: "Neproběhla", callback_data: `pe:o:${item.activityId}:n` }),
      expect.objectContaining({ text: "Nastal problém", callback_data: `pe:o:${item.activityId}:p` }),
      expect.objectContaining({ text: "Otevřít událost", url: item.openUrl }),
    ]));
  });

  it("enriches Telegram POSTEVENT from the trusted event card without changing SQL payloads", () => {
    expect(dispatcher).toContain("postEventDelivery");
    expect(dispatcher).toContain("loadTrustedTelegramEventCard(eventId, language, { includeParticipants: false })");
    expect(dispatcher).toContain("cityName: card.city");
  });

  it("builds Czech in-app event context with localized city", () => {
    expect(buildInAppPostEventContext({
      title: "Volejbal",
      eventDate: "2026-09-02",
      eventTime: "15:30:00",
      cityId: "olomouc",
    }, "cs")).toBe("Volejbal · 2. 9. 2026 · 15:30 · Olomouc");
  });

  it("uses the in-app user's UI language for city names", () => {
    expect(buildInAppPostEventContext({
      title: "Volleyball",
      eventDate: "2026-09-02",
      eventTime: "15:30:00",
      cityId: "olomouc",
    }, "pl")).toContain("Ołomuniec");
  });
});
