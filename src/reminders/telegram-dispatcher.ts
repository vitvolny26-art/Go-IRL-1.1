import { loadTrustedTelegramEventCard } from "../../api/_shared/telegram-share-event.js";
import { createTelegramShareCardToken } from "../../api/_shared/telegram-share-card-token.js";
import { buildTelegramActivityInviteUrl } from "../invitationLink.js";
import { buildReminderMessage, validateReminderMessage } from "./message-builder.js";
import type { ReminderDispatcher } from "./worker.js";
import type {
  ReminderDelivery,
  ReminderDeliveryOutcome,
} from "./types.js";

type TelegramApiResponse = {
  ok?: boolean;
  result?: { message_id?: number };
  description?: string;
};

export type TelegramReminderDispatcherOptions = {
  botToken: string;
  botUsername?: string;
  appName?: string;
  fetchImpl?: typeof fetch;
};

const safeCode = (value: string) =>
  value.toLocaleLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 60) || "unknown";
const telegramMediaOrigin = "https://go-irl-1-1.vercel.app";
const reminderFooter: Record<ReminderDelivery["language"], string> = {
  ru: "Проверьте детали и место встречи перед выходом.",
  uk: "Перевірте деталі та місце зустрічі перед виходом.",
  cs: "Před odchodem si zkontrolujte detaily a místo setkání.",
  en: "Check the details and meeting place before you leave.",
  pl: "Przed wyjściem sprawdź szczegóły i miejsce spotkania.",
  sk: "Pred odchodom si skontrolujte detaily a miesto stretnutia.",
};
const isTelegramMediaError = (status: number, description = "") => status === 400
  && /mime type|wrong type of the web page content|failed to get http url content/i.test(description);

export class TelegramReminderDispatcher implements ReminderDispatcher {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: TelegramReminderDispatcherOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async activityShareCardUrl(delivery: ReminderDelivery) {
    try {
      const card = await loadTrustedTelegramEventCard(
        delivery.event.eventId,
        delivery.language,
      );
      if (!card) return null;
      const image = new URL("/api/telegram/event-share-card", telegramMediaOrigin);
      image.searchParams.set("mode", "persisted");
      image.searchParams.set("token", createTelegramShareCardToken(card, this.options.botToken));
      return image.toString();
    } catch {
      return null;
    }
  }

  private async deletePreviousParticipation(delivery: ReminderDelivery) {
    if (delivery.leadMinutes !== 180) return;
    const target = delivery.previousParticipationTelegramMessageId;
    if (!target || !/^[1-9][0-9]*$/.test(target)) return;
    try {
      await this.fetchImpl(`https://api.telegram.org/bot${this.options.botToken}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: delivery.recipientId, message_id: Number(target) }),
      });
    } catch {
      return;
    }
  }

  async send(delivery: ReminderDelivery): Promise<ReminderDeliveryOutcome> {
    if (delivery.provider !== "telegram") {
      return { status: "cancelled", reason: "provider_not_enabled" };
    }
    if (delivery.cancelReason) {
      return { status: "cancelled", reason: delivery.cancelReason };
    }

    const message = buildReminderMessage(delivery);
    if (!validateReminderMessage(message)) {
      return { status: "failed", errorCode: "invalid_reminder_message" };
    }

    const miniAppUrl = buildTelegramActivityInviteUrl(
      delivery.event.eventId,
      this.options.botUsername || "GOirl_bot",
      this.options.appName || "",
    );
    const actions = message.actions.map((action) => ({
      kind: action.kind,
      button: {
        text: action.label,
        url: action.kind === "open" && miniAppUrl ? miniAppUrl : action.url,
      },
    }));
    const primaryRow = actions.filter((action) => action.kind !== "map").map((action) => action.button).slice(0, 2);
    const mapAction = actions.find((action) => action.kind === "map");
    const deliveryText = `${message.heading}\n\n${message.body}\n\n${reminderFooter[delivery.language]}`;
    const replyMarkup = { inline_keyboard: [
      ...(primaryRow.length ? [primaryRow] : []),
      ...(mapAction ? [[mapAction.button]] : []),
    ] };
    const shareCardUrl = await this.activityShareCardUrl(delivery);

    let response = await this.fetchImpl(
      `https://api.telegram.org/bot${this.options.botToken}/${shareCardUrl ? "sendPhoto" : "sendMessage"}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shareCardUrl
          ? { chat_id: delivery.recipientId, photo: shareCardUrl, caption: deliveryText, reply_markup: replyMarkup }
          : { chat_id: delivery.recipientId, text: deliveryText, disable_web_page_preview: false, reply_markup: replyMarkup }),
      },
    );
    let payload = await response.json() as TelegramApiResponse;
    if (shareCardUrl && isTelegramMediaError(response.status, payload.description)) {
      response = await this.fetchImpl(`https://api.telegram.org/bot${this.options.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: delivery.recipientId,
          text: deliveryText,
          disable_web_page_preview: false,
          reply_markup: replyMarkup,
        }),
      });
      payload = await response.json() as TelegramApiResponse;
    }
    if (response.ok && payload.ok && payload.result?.message_id) {
      const outcome: ReminderDeliveryOutcome = {
        status: "sent",
        providerMessageId: String(payload.result.message_id),
      };
      await this.deletePreviousParticipation(delivery);
      return outcome;
    }

    const description = safeCode(payload.description || `http_${response.status}`);
    if (response.status === 403 || (response.status === 400 && description.includes("chat_not_found"))) {
      return { status: "cancelled", reason: `telegram_${description}` };
    }
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`telegram_${response.status}`);
    }
    return { status: "failed", errorCode: `telegram_${description}` };
  }
}
