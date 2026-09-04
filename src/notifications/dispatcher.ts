import { signedActivityShareCardUrl } from "../../api/_shared/activity-share-card-storage.js";
import { isShareLanguage, loadTrustedTelegramEventCard } from "../../api/_shared/telegram-share-event.js";
import { buildTelegramActivityInviteUrl } from "../invitationLink.js";
import { buildEventNotificationText } from "./message-builder.js";
import { buildEventNotificationTelegramReplyMarkup } from "./telegram-reply-markup.js";
import type { EventNotificationDelivery, EventNotificationOutcome } from "./types.js";

export type EventNotificationDispatcherOptions = {
  telegramBotToken: string;
  telegramBotUsername?: string;
  telegramAppName?: string;
  graphVersion: string;
  whatsapp?: { phoneNumberId: string; accessToken: string; templateName?: string };
  instagram?: { accountId: string; accessToken: string; apiMode: "instagram_login" | "facebook_login" };
  messenger?: { pageId: string; accessToken: string };
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

type ApiPayload = { ok?: boolean; result?: { message_id?: number }; messages?: Array<{ id?: string }>; message_id?: string; recipient_id?: string; error?: { code?: number; error_subcode?: number; is_transient?: boolean } };
const withinWindow = (delivery: EventNotificationDelivery, now: Date) => { if (!delivery.recipientLastInboundAt) return false; const inbound = new Date(delivery.recipientLastInboundAt).getTime(); return Number.isFinite(inbound) && now.getTime() - inbound >= 0 && now.getTime() - inbound <= 24 * 60 * 60_000; };

export class EventNotificationDispatcher {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  constructor(private readonly options: EventNotificationDispatcherOptions) { this.fetchImpl = options.fetchImpl ?? fetch; this.now = options.now ?? (() => new Date()); }

  private async favoriteOrganizerShareCard(delivery: EventNotificationDelivery) {
    if (delivery.kind !== "social.favorite_organizer_event_created") return null;
    const eventId = delivery.payload.eventId || delivery.activityId;
    if (!eventId) return null;
    const language = isShareLanguage(delivery.language) ? delivery.language : "ru";
    const card = await loadTrustedTelegramEventCard(eventId, language);
    return card ? signedActivityShareCardUrl(card) : null;
  }

  async send(delivery: EventNotificationDelivery): Promise<EventNotificationOutcome> {
    const text = buildEventNotificationText(delivery);
    let url: string; let token: string; let body: unknown;
    if (delivery.provider === "telegram") {
      const eventId = delivery.payload.eventId || delivery.activityId || "";
      const telegramOpenUrl = eventId ? buildTelegramActivityInviteUrl(eventId, this.options.telegramBotUsername || "GOirl_bot", this.options.telegramAppName || "") || delivery.openUrl : delivery.openUrl;
      const replyMarkup = buildEventNotificationTelegramReplyMarkup(delivery, telegramOpenUrl);
      const shareCardUrl = await this.favoriteOrganizerShareCard(delivery);
      url = `https://api.telegram.org/bot${this.options.telegramBotToken}/${shareCardUrl ? "sendPhoto" : "sendMessage"}`;
      token = "";
      body = shareCardUrl
        ? { chat_id: delivery.recipientId, photo: shareCardUrl, caption: text, reply_markup: replyMarkup }
        : { chat_id: delivery.recipientId, text, reply_markup: replyMarkup };
    } else {
      const canRespond = withinWindow(delivery, this.now());
      if (delivery.provider === "whatsapp") {
        const config = this.options.whatsapp; if (!config) return { status: "cancelled", reason: "whatsapp_not_configured" };
        url = `https://graph.facebook.com/${this.options.graphVersion}/${config.phoneNumberId}/messages`; token = config.accessToken;
        body = canRespond ? { messaging_product: "whatsapp", to: delivery.recipientId, type: "text", text: { body: text } } : config.templateName ? { messaging_product: "whatsapp", to: delivery.recipientId, type: "template", template: { name: config.templateName, language: { code: "ru" }, components: [{ type: "body", parameters: [{ type: "text", text }, { type: "text", text: delivery.openUrl }] }] } } : null;
        if (!body) return { status: "cancelled", reason: "whatsapp_template_unavailable" };
      } else {
        if (!canRespond) return { status: "cancelled", reason: "meta_messaging_window_closed" };
        if (delivery.provider === "instagram") { const config = this.options.instagram; if (!config) return { status: "cancelled", reason: "instagram_not_configured" }; url = config.apiMode === "instagram_login" ? `https://graph.instagram.com/${this.options.graphVersion}/me/messages` : `https://graph.facebook.com/${this.options.graphVersion}/${config.accountId}/messages`; token = config.accessToken; body = { recipient: { id: delivery.recipientId }, message: { text } }; }
        else { const config = this.options.messenger; if (!config) return { status: "cancelled", reason: "messenger_not_configured" }; url = `https://graph.facebook.com/${this.options.graphVersion}/${config.pageId}/messages`; token = config.accessToken; body = { messaging_type: "RESPONSE", recipient: { id: delivery.recipientId }, message: { text } }; }
      }
    }
    const response = await this.fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const payload = await response.json() as ApiPayload;
    const messageId = payload.result?.message_id || payload.messages?.[0]?.id || payload.message_id || payload.recipient_id;
    if (response.ok && (delivery.provider !== "telegram" || payload.ok)) return { status: "sent", ...(messageId ? { providerMessageId: String(messageId) } : {}) };
    const code = `${delivery.provider}_${payload.error?.code || response.status}` + (payload.error?.error_subcode ? `_${payload.error.error_subcode}` : "");
    if (response.status === 429 || response.status >= 500 || payload.error?.is_transient) throw new Error(code);
    if (response.status === 403 || payload.error?.code === 10 || payload.error?.code === 200) return { status: "cancelled", reason: code };
    return { status: "failed", errorCode: code };
  }
}
