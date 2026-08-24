import { describe, expect, it, vi } from "vitest";
import { EventNotificationDispatcher } from "./dispatcher";
import type { EventNotificationDelivery } from "./types";

const eventId = "39e31319-a4fc-4d41-bf1e-d713178290d1";

const telegramDelivery: EventNotificationDelivery = {
  id: "notification-1",
  userKey: "telegram:1",
  activityId: eventId,
  kind: "join_confirmed",
  payload: {
    eventId,
    title: { ru: "Volejbal" },
    date: "2026-07-29",
    time: "18:00",
    address: "Sobacov",
  },
  attemptCount: 1,
  provider: "telegram",
  recipientId: "1",
  language: "ru",
  openUrl: `https://go-irl-1-0.vercel.app/join/${eventId}`,
};

const favoritedDelivery: EventNotificationDelivery = {
  id: "notification-favorited",
  userKey: "telegram:organizer",
  kind: "social.favorited",
  payload: { openPath: "/" },
  attemptCount: 1,
  provider: "telegram",
  recipientId: "3",
  language: "ru",
  openUrl: "https://go-irl.fun/",
};

const beautyDelivery: EventNotificationDelivery = {
  id: "notification-beauty",
  userKey: "telegram:2",
  kind: "services.booking_requested",
  payload: {
    subjectType: "beauty_booking",
    bookingId: "booking-1",
    title: { cs: "Gelová manikúra" },
    date: "2026-08-08",
    time: "10:30",
    address: "Olomouc centrum",
    counterpartName: "Anna",
    openPath: "/services",
  },
  attemptCount: 1,
  provider: "telegram",
  recipientId: "2",
  language: "cs",
  openUrl: "https://goirl.example/services",
};

describe("EventNotificationDispatcher Telegram links", () => {
  it("opens lifecycle notifications in the Telegram Mini App", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      result: { message_id: 42 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const dispatcher = new EventNotificationDispatcher({
      telegramBotToken: "test-token",
      graphVersion: "v23.0",
      fetchImpl,
    });

    await dispatcher.send(telegramDelivery);

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.reply_markup.inline_keyboard[0][0].url).toBe(
      `https://t.me/GOirl_bot?startapp=${eventId}`,
    );
    expect(body.reply_markup.inline_keyboard[0][0].url).not.toContain("/join/");
  });

  it("keeps Beauty booking notifications on the services deep link", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      result: { message_id: 43 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const dispatcher = new EventNotificationDispatcher({
      telegramBotToken: "test-token",
      graphVersion: "v23.0",
      fetchImpl,
    });

    await dispatcher.send(beautyDelivery);

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.reply_markup.inline_keyboard[0][0].url).toBe("https://goirl.example/services");
    expect(body.reply_markup.inline_keyboard[0][0].text).toBe("Открыть GO IRL");
  });

  it("sends organizer-favorited notification as a plain bot message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 44 } }), { status: 200, headers: { "content-type": "application/json" } }));
    const dispatcher = new EventNotificationDispatcher({ telegramBotToken: "test-token", graphVersion: "v23.0", fetchImpl });
    await dispatcher.send(favoritedDelivery);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/sendMessage");
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.text).toBe("⭐ Вас добавили в избранное");
    expect(body.reply_markup.inline_keyboard[0][0].url).toBe("https://go-irl.fun/");
    expect(body.reply_markup.inline_keyboard[0][0].text).toBe("Открыть GO IRL");
  });
});
