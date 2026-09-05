import { providerTemplateLanguageCode } from "../userLanguage.js";
import { buildReminderMessage, validateReminderMessage } from "./message-builder.js";
import type { ReminderDispatcher } from "./worker.js";
import type { ReminderDelivery, ReminderDeliveryOutcome, ReminderMessage } from "./types.js";

type MetaProvider = "whatsapp" | "instagram" | "messenger";
type GraphErrorPayload = { error?: { code?: number; error_subcode?: number; is_transient?: boolean; message?: string }; messages?: Array<{ id?: string }>; message_id?: string; recipient_id?: string };
export type MetaReminderDispatcherOptions = { graphVersion: string; whatsapp?: { phoneNumberId: string; accessToken: string; templateName: string }; instagram?: { accountId: string; accessToken: string; apiMode?: "instagram_login" | "facebook_login" }; messenger?: { pageId: string; accessToken: string }; now?: () => Date; fetchImpl?: typeof fetch };
const graphUrl = (version: string, path: string, graphHost = "graph.facebook.com") => `https://${graphHost}/${version}/${path}`;
const withinMessagingWindow = (delivery: ReminderDelivery, now: Date) => { if (!delivery.recipientLastInboundAt) return false; const inbound = new Date(delivery.recipientLastInboundAt); return !Number.isNaN(inbound.getTime()) && now.getTime() - inbound.getTime() >= 0 && now.getTime() - inbound.getTime() <= 24 * 60 * 60_000; };
const reminderText = (message: ReminderMessage) => [message.heading, "", message.body, "", ...message.actions.map((action) => `${action.label}: ${action.url}`)].join("\n");
export function buildMetaReminderPayload(delivery: ReminderDelivery, message: ReminderMessage, templateName?: string) {
  if (delivery.provider === "whatsapp") {
    if (!templateName) return null;
    return { messaging_product: "whatsapp", to: delivery.recipientId, type: "template", template: { name: templateName, language: { code: providerTemplateLanguageCode(delivery.language) }, components: [{ type: "body", parameters: [{ type: "text", text: message.heading }, { type: "text", text: delivery.event.title }, { type: "text", text: delivery.event.dateTime }, { type: "text", text: delivery.event.location }, { type: "text", text: delivery.event.openUrl }, { type: "text", text: delivery.event.calendarUrl || delivery.event.openUrl }] }] } };
  }
  const messageBody = { text: reminderText(message) };
  return delivery.provider === "messenger" ? { messaging_type: "RESPONSE", recipient: { id: delivery.recipientId }, message: messageBody } : { recipient: { id: delivery.recipientId }, message: messageBody };
}
const providerMessageId = (payload: GraphErrorPayload) => payload.messages?.[0]?.id || payload.message_id || payload.recipient_id;
const safeErrorCode = (provider: MetaProvider, response: Response, payload: GraphErrorPayload) => { const code = payload.error?.code || response.status; const subcode = payload.error?.error_subcode; return `${provider}_${code}${subcode ? `_${subcode}` : ""}`.slice(0, 80); };
export class MetaReminderDispatcher implements ReminderDispatcher {
  private readonly fetchImpl: typeof fetch; private readonly now: () => Date;
  constructor(private readonly options: MetaReminderDispatcherOptions) { this.fetchImpl = options.fetchImpl ?? fetch; this.now = options.now ?? (() => new Date()); }
  async send(delivery: ReminderDelivery): Promise<ReminderDeliveryOutcome> {
    if (delivery.provider === "telegram") return { status: "cancelled", reason: "provider_not_enabled" };
    if (delivery.cancelReason) return { status: "cancelled", reason: delivery.cancelReason };
    if ((delivery.provider === "instagram" || delivery.provider === "messenger") && !withinMessagingWindow(delivery, this.now())) return { status: "cancelled", reason: "meta_messaging_window_closed" };
    const message = buildReminderMessage(delivery); if (!validateReminderMessage(message)) return { status: "failed", errorCode: "invalid_reminder_message" };
    let url: string; let token: string; let payload: unknown;
    if (delivery.provider === "whatsapp") { if (!this.options.whatsapp?.templateName) return { status: "cancelled", reason: "whatsapp_template_unavailable" }; url = graphUrl(this.options.graphVersion, `${this.options.whatsapp.phoneNumberId}/messages`); token = this.options.whatsapp.accessToken; payload = buildMetaReminderPayload(delivery, message, this.options.whatsapp.templateName); }
    else if (delivery.provider === "instagram") { if (!this.options.instagram) return { status: "cancelled", reason: "instagram_not_configured" }; const instagramLogin = this.options.instagram.apiMode === "instagram_login"; url = graphUrl(this.options.graphVersion, instagramLogin ? "me/messages" : `${this.options.instagram.accountId}/messages`, instagramLogin ? "graph.instagram.com" : "graph.facebook.com"); token = this.options.instagram.accessToken; payload = buildMetaReminderPayload(delivery, message); }
    else { if (!this.options.messenger) return { status: "cancelled", reason: "messenger_not_configured" }; url = graphUrl(this.options.graphVersion, `${this.options.messenger.pageId}/messages`); token = this.options.messenger.accessToken; payload = buildMetaReminderPayload(delivery, message); }
    const response = await this.fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const graph = await response.json() as GraphErrorPayload; if (response.ok && !graph.error) return { status: "sent", providerMessageId: providerMessageId(graph) };
    const code = safeErrorCode(delivery.provider, response, graph); if (response.status === 429 || response.status >= 500 || graph.error?.is_transient) throw new Error(code); if (graph.error?.code === 10 || graph.error?.code === 200 || graph.error?.code === 551) return { status: "cancelled", reason: code }; return { status: "failed", errorCode: code };
  }
}
export class RoutedReminderDispatcher implements ReminderDispatcher { constructor(private readonly telegram: ReminderDispatcher, private readonly meta: ReminderDispatcher) {} send(delivery: ReminderDelivery) { return delivery.provider === "telegram" ? this.telegram.send(delivery) : this.meta.send(delivery); } }
