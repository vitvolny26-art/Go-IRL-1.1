import { describe, expect, it, vi } from "vitest";
import { loadTrustedTelegramEventCard } from "../../api/_shared/telegram-share-event.js";
import { createTelegramShareCardToken } from "../../api/_shared/telegram-share-card-token.js";
import type { ReminderDelivery } from "./types.js";
import { TelegramReminderDispatcher } from "./telegram-dispatcher.js";

vi.mock("../../api/_shared/telegram-share-event.js", () => ({ loadTrustedTelegramEventCard: vi.fn() }));
vi.mock("../../api/_shared/telegram-share-card-token.js", () => ({ createTelegramShareCardToken: vi.fn() }));

const eventId = "39e31319-a4fc-4d41-bf1e-d713178290d1";

const delivery: ReminderDelivery = {
  reminderId: "reminder-1",
  deliveryKey: "delivery-1",
  provider: "telegram",
  recipientId: "123",
  leadMinutes: 60,
  language: "ru",
  attemptCount: 1,
  event: {
    eventId,
    title: "Волейбол",
    dateTime: "30 июл. 2026 г. · 18:00",
    location: "ZŠ Demlova",
    openUrl: `https://go-irl.example/join/${eventId}`,
    calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Olomouc",
  },
};

const response = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("TelegramReminderDispatcher", () => {
  it("sends the localized reminder with Mini App, calendar, and map actions", async () => {
    vi.mocked(loadTrustedTelegramEventCard).mockResolvedValue({ eventId } as never);
    vi.mocked(createTelegramShareCardToken).mockReturnValue("card-token");
    const fetchImpl = vi.fn<typeof fetch>(async () => response(200, {
      ok: true,
      result: { message_id: 42 },
    }));
    const dispatcher = new TelegramReminderDispatcher({
      botToken: "test-token",
      fetchImpl,
    });

    await expect(dispatcher.send(delivery)).resolves.toEqual({
      status: "sent",
      providerMessageId: "42",
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("bottest-token/sendPhoto");
    const body = JSON.parse(String(init?.body));
    expect(body.chat_id).toBe("123");
    expect(body.photo).toContain("/api/telegram/event-share-card");
    expect(body.photo).toContain("mode=persisted");
    expect(body.caption).toContain("Событие начнётся через 1 ч");
    expect(body.caption).toContain("Проверьте детали и место встречи");
    expect(body.reply_markup.inline_keyboard).toHaveLength(2);
    expect(body.reply_markup.inline_keyboard[0]).toHaveLength(2);
    expect(body.reply_markup.inline_keyboard[0][0].url).toBe(
      `https://t.me/GOirl_bot?startapp=${eventId}`,
    );
    expect(body.reply_markup.inline_keyboard[0][0].url).not.toContain("/join/");
    expect(body.reply_markup.inline_keyboard[0][1].url).toContain("calendar.google.com");
    expect(body.reply_markup.inline_keyboard[1]).toHaveLength(1);
    expect(body.reply_markup.inline_keyboard[1][0].url).toContain("google.com/maps");
  });

  it("replaces the prior participation-state message after a successful T-3 delivery", async () => {
    vi.mocked(loadTrustedTelegramEventCard).mockResolvedValue({ eventId } as never);
    vi.mocked(createTelegramShareCardToken).mockReturnValue("card-token");
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(200, { ok: true, result: { message_id: 45 } }))
      .mockResolvedValueOnce(response(200, { ok: true, result: true }));
    const dispatcher = new TelegramReminderDispatcher({ botToken: "test-token", fetchImpl });
    await expect(dispatcher.send({ ...delivery, leadMinutes: 180, previousParticipationTelegramMessageId: "41" }))
      .resolves.toEqual({ status: "sent", providerMessageId: "45" });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/sendPhoto");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/deleteMessage");
    const deleteBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
    expect(deleteBody).toEqual({ chat_id: "123", message_id: 41 });
  });

  it("falls back to text when the canonical Activity card cannot be loaded", async () => {
    vi.mocked(loadTrustedTelegramEventCard).mockResolvedValue(null);
    const fetchImpl = vi.fn<typeof fetch>(async () => response(200, { ok: true, result: { message_id: 43 } }));
    const dispatcher = new TelegramReminderDispatcher({ botToken: "test-token", fetchImpl });
    await expect(dispatcher.send(delivery)).resolves.toEqual({ status: "sent", providerMessageId: "43" });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/sendMessage");
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.text).toContain("Проверьте детали и место встречи");
  });

  it("falls back to text when Telegram rejects the Activity photo MIME type", async () => {
    vi.mocked(loadTrustedTelegramEventCard).mockResolvedValue({ eventId } as never);
    vi.mocked(createTelegramShareCardToken).mockReturnValue("card-token");
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(400, { ok: false, description: "mime type text/plain; charset=utf-8 is not supported" }))
      .mockResolvedValueOnce(response(200, { ok: true, result: { message_id: 44 } }));
    const dispatcher = new TelegramReminderDispatcher({ botToken: "test-token", fetchImpl });
    await expect(dispatcher.send(delivery)).resolves.toEqual({ status: "sent", providerMessageId: "44" });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/sendPhoto");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/sendMessage");
  });

  it("cancels without a network call when consent or identity is unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const dispatcher = new TelegramReminderDispatcher({
      botToken: "test-token",
      fetchImpl,
    });
    await expect(dispatcher.send({
      ...delivery,
      cancelReason: "provider_consent_missing",
    })).resolves.toEqual({
      status: "cancelled",
      reason: "provider_consent_missing",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("cancels a blocked recipient and retries transient Telegram failures", async () => {
    const blocked = new TelegramReminderDispatcher({
      botToken: "test-token",
      fetchImpl: vi.fn<typeof fetch>(async () => response(403, {
        ok: false,
        description: "Forbidden: bot was blocked by the user",
      })),
    });
    await expect(blocked.send(delivery)).resolves.toMatchObject({
      status: "cancelled",
    });

    const transient = new TelegramReminderDispatcher({
      botToken: "test-token",
      fetchImpl: vi.fn<typeof fetch>(async () => response(503, {
        ok: false,
        description: "Service unavailable",
      })),
    });
    await expect(transient.send(delivery)).rejects.toThrow("telegram_503");
  });
});
