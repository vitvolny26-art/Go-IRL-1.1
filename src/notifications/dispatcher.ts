import { loadTrustedTelegramEventCard } from "../../api/_shared/telegram-share-event.js";
import { createTelegramShareCardToken } from "../../api/_shared/telegram-share-card-token.js";
import { buildTelegramActivityInviteUrl } from "../invitationLink.js";
import { contentLanguageForUserLanguage, providerTemplateLanguageCode } from "../userLanguage.js";
import { buildEventNotificationText } from "./message-builder.js";
import { buildOrganizerJoinAlertText } from "./organizer-join-alert.js";
import { buildEventNotificationTelegramReplyMarkup } from "./telegram-reply-markup.js";
import type { EventNotificationDelivery, EventNotificationOutcome } from "./types.js";

export type EventNotificationDispatcherOptions = {
  telegramBotToken: string; telegramBotUsername?: string; telegramAppName?: string; graphVersion: string;
  whatsapp?: { phoneNumberId: string; accessToken: string; templateName?: string };
  instagram?: { accountId: string; accessToken: string; apiMode: "instagram_login" | "facebook_login" };
  messenger?: { pageId: string; accessToken: string }; fetchImpl?: typeof fetch; now?: () => Date;
};

type ApiPayload = { ok?: boolean; description?: string; result?: { message_id?: number }; messages?: Array<{ id?: string }>; message_id?: string; recipient_id?: string; error?: { code?: number; error_subcode?: number; is_transient?: boolean } };
const withinWindow = (delivery: EventNotificationDelivery, now: Date) => { if (!delivery.recipientLastInboundAt) return false; const inbound = new Date(delivery.recipientLastInboundAt).getTime(); return Number.isFinite(inbound) && now.getTime() - inbound >= 0 && now.getTime() - inbound <= 24 * 60 * 60_000; };
const telegramMediaOrigin = "https://go-irl-1-1.vercel.app";
const favoriteOrganizerFooter: Record<EventNotificationDelivery["language"], string> = {
  ru: "Откройте событие, чтобы посмотреть детали и присоединиться.",
  uk: "Відкрийте подію, щоб переглянути деталі та долучитися.",
  cs: "Otevřete událost, podívejte se na detaily a přidejte se.",
  en: "Open the event to see the details and join.",
  pl: "Otwórz wydarzenie, sprawdź szczegóły i dołącz.",
  sk: "Otvorte udalosť, pozrite si detaily a pridajte sa.",
};
const isTelegramMediaError = (status: number, description = "") => status === 400
  && /mime type|wrong type of the web page content|failed to get http url content/i.test(description);

export class EventNotificationDispatcher {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  constructor(private readonly options: EventNotificationDispatcherOptions) { this.fetchImpl = options.fetchImpl ?? fetch; this.now = options.now ?? (() => new Date()); }

  private async favoriteOrganizerShareCard(delivery: EventNotificationDelivery) {
    if (delivery.kind !== "social.favorite_organizer_event_created") return null;
    const eventId = delivery.payload.eventId || delivery.activityId; if (!eventId) return null;
    try {
      const card = await loadTrustedTelegramEventCard(eventId, contentLanguageForUserLanguage(delivery.language));
      if (!card) return null;
      const image = new URL("/api/telegram/event-share-card", telegramMediaOrigin);
      image.searchParams.set("mode", "persisted");
      image.searchParams.set("token", createTelegramShareCardToken(card, this.options.telegramBotToken));
      return image.toString();
    } catch {
      return null;
    }
  }

  private async postEventDelivery(delivery: EventNotificationDelivery) {
    if (delivery.kind !== "post_event.organizer_confirmation" && delivery.kind !== "post_event.participant_confirmation") return delivery;
    if (delivery.payload.postEventStage === "organizer_cleanup" || delivery.payload.postEventStage === "participant_cleanup") return delivery;
    const eventId = delivery.payload.eventId || delivery.activityId; if (!eventId) return delivery;
    const card = await loadTrustedTelegramEventCard(eventId, delivery.language, { includeParticipants: false });
    if (!card) return delivery;
    return { ...delivery, payload: { ...delivery.payload,
      title: { ...delivery.payload.title, [delivery.language]: card.title },
      activity: { ...delivery.payload.activity, [delivery.language]: card.activity },
      eventDate: delivery.payload.eventDate || card.eventDate, eventTime: delivery.payload.eventTime || card.time,
      cityName: card.city, address: delivery.payload.address || card.address } };
  }

  private async deleteOrganizerCompletion(delivery: EventNotificationDelivery): Promise<EventNotificationOutcome> {
    const target = delivery.payload.telegramMessageId;
    if (!target || !/^[1-9][0-9]*$/.test(target)) return { status: "failed", errorCode: "telegram_cleanup_message_id_invalid" };
    const response = await this.fetchImpl(`https://api.telegram.org/bot${this.options.telegramBotToken}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: delivery.recipientId, message_id: Number(target) }),
    });
    const payload = await response.json() as ApiPayload;
    if (response.ok && payload.ok) return { status: "sent" };
    if (response.status === 400 && /message to delete not found/i.test(payload.description || "")) return { status: "sent" };
    const code = `telegram_${response.status}`;
    if (response.status === 429 || response.status >= 500) throw new Error(code);
    if (response.status === 403) return { status: "cancelled", reason: code };
    return { status: "failed", errorCode: code };
  }

  private async deletePreviousRollingJoin(delivery: EventNotificationDelivery) {
    const target = delivery.payload.previousTelegramMessageId;
    if (!target || !/^[1-9][0-9]*$/.test(target)) return;
    try {
      await this.fetchImpl(`https://api.telegram.org/bot${this.options.telegramBotToken}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: delivery.recipientId, message_id: Number(target) }),
      });
    } catch {
      return;
    }
  }

  async send(delivery: EventNotificationDelivery): Promise<EventNotificationOutcome> {
    const messageDelivery = delivery.provider === "telegram" ? await this.postEventDelivery(delivery) : delivery;
    const postEventCleanup = messageDelivery.payload.postEventStage === "organizer_cleanup"
      || messageDelivery.payload.postEventStage === "participant_cleanup";
    if (delivery.provider === "telegram"
      && (messageDelivery.kind === "post_event.organizer_confirmation" || messageDelivery.kind === "post_event.participant_confirmation")
      && postEventCleanup) {
      return this.deleteOrganizerCompletion(messageDelivery);
    }

    if (delivery.provider === "telegram" && messageDelivery.kind === "activity.organizer_join_alert") {
      await this.deletePreviousRollingJoin(messageDelivery);
    }

    const text = buildEventNotificationText(messageDelivery);
    const deliveryText = messageDelivery.kind === "activity.organizer_join_alert"
      ? buildOrganizerJoinAlertText(messageDelivery)
      : text;
    let url: string; let token: string; let body: unknown; let telegramTextFallbackBody: unknown | null = null;
    if (delivery.provider === "telegram") {
      const eventId = messageDelivery.payload.eventId || messageDelivery.activityId || "";
      const telegramOpenUrl = eventId ? buildTelegramActivityInviteUrl(eventId, this.options.telegramBotUsername || "GOirl_bot", this.options.telegramAppName || "") || messageDelivery.openUrl : messageDelivery.openUrl;
      const replyMarkup = buildEventNotificationTelegramReplyMarkup(messageDelivery, telegramOpenUrl);
      const shareCardUrl = await this.favoriteOrganizerShareCard(messageDelivery);
      const telegramDeliveryText = messageDelivery.kind === "social.favorite_organizer_event_created"
        ? `${deliveryText}\n\n${favoriteOrganizerFooter[messageDelivery.language]}`
        : deliveryText;
      url = `https://api.telegram.org/bot${this.options.telegramBotToken}/${shareCardUrl ? "sendPhoto" : "sendMessage"}`; token = "";
      body = shareCardUrl ? { chat_id: messageDelivery.recipientId, photo: shareCardUrl, caption: telegramDeliveryText, reply_markup: replyMarkup } : { chat_id: messageDelivery.recipientId, text: telegramDeliveryText, reply_markup: replyMarkup };
      if (shareCardUrl) telegramTextFallbackBody = { chat_id: messageDelivery.recipientId, text: telegramDeliveryText, reply_markup: replyMarkup };
    } else {
      const canRespond = withinWindow(delivery, this.now());
      if (delivery.provider === "whatsapp") {
        const config = this.options.whatsapp; if (!config) return { status: "cancelled", reason: "whatsapp_not_configured" };
        url = `https://graph.facebook.com/${this.options.graphVersion}/${config.phoneNumberId}/messages`; token = config.accessToken;
        body = canRespond ? { messaging_product: "whatsapp", to: delivery.recipientId, type: "text", text: { body: deliveryText } }
          : config.templateName ? { messaging_product: "whatsapp", to: delivery.recipientId, type: "template", template: { name: config.templateName, language: { code: providerTemplateLanguageCode(delivery.language) }, components: [{ type: "body", parameters: [{ type: "text", text: deliveryText }, { type: "text", text: delivery.openUrl }] }] } } : null;
        if (!body) return { status: "cancelled", reason: "whatsapp_template_unavailable" };
      } else {
        if (!canRespond) return { status: "cancelled", reason: "meta_messaging_window_closed" };
        if (delivery.provider === "instagram") { const config = this.options.instagram; if (!config) return { status: "cancelled", reason: "instagram_not_configured" }; url = config.apiMode === "instagram_login" ? `https://graph.instagram.com/${this.options.graphVersion}/me/messages` : `https://graph.facebook.com/${this.options.graphVersion}/${config.accountId}/messages`; token = config.accessToken; body = { recipient: { id: delivery.recipientId }, message: { text: deliveryText } }; }
        else { const config = this.options.messenger; if (!config) return { status: "cancelled", reason: "messenger_not_configured" }; url = `https://graph.facebook.com/${this.options.graphVersion}/${config.pageId}/messages`; token = config.accessToken; body = { messaging_type: "RESPONSE", recipient: { id: delivery.recipientId }, message: { text: deliveryText } }; }
      }
    }
    let response = await this.fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    let payload = await response.json() as ApiPayload;
    if (delivery.provider === "telegram" && telegramTextFallbackBody && isTelegramMediaError(response.status, payload.description)) {
      response = await this.fetchImpl(`https://api.telegram.org/bot${this.options.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramTextFallbackBody),
      });
      payload = await response.json() as ApiPayload;
    }
    const messageId = payload.result?.message_id || payload.messages?.[0]?.id || payload.message_id || payload.recipient_id;
    if (response.ok && (delivery.provider !== "telegram" || payload.ok)) return { status: "sent", ...(messageId ? { providerMessageId: String(messageId) } : {}) };
    const code = `${delivery.provider}_${payload.error?.code || response.status}` + (payload.error?.error_subcode ? `_${payload.error.error_subcode}` : "");
    if (response.status === 429 || response.status >= 500 || payload.error?.is_transient) throw new Error(code);
    if (response.status === 403 || payload.error?.code === 10 || payload.error?.code === 200) return { status: "cancelled", reason: code };
    return { status: "failed", errorCode: code };
  }
}
