import type { EventNotificationDelivery } from "./types.js";

type TelegramInlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

const organizerCallback = (eventId: string, value: "h" | "n" | "p") => `pe:o:${eventId}:${value}`;
const participantCallback = (feedbackId: string, value: "a" | "x" | "n") => `pe:p:${feedbackId}:${value}`;

export const buildEventNotificationTelegramReplyMarkup = (
  delivery: EventNotificationDelivery,
  openUrl: string,
) => {
  const openButton: TelegramInlineButton = {
    text: delivery.payload.eventId || delivery.activityId ? "Открыть событие" : "Открыть GO IRL",
    url: openUrl,
  };

  if (delivery.kind === "post_event.organizer_confirmation") {
    const eventId = delivery.payload.eventId || delivery.activityId;
    if (!eventId) return { inline_keyboard: [[openButton]] };

    return {
      inline_keyboard: [
        [
          { text: "Состоялось", callback_data: organizerCallback(eventId, "h") },
          { text: "Не состоялось", callback_data: organizerCallback(eventId, "n") },
        ],
        [
          { text: "Есть проблема", callback_data: organizerCallback(eventId, "p") },
        ],
        [openButton],
      ],
    };
  }

  if (delivery.kind === "post_event.participant_confirmation") {
    const feedbackId = delivery.payload.feedbackId;
    if (!feedbackId) return { inline_keyboard: [[openButton]] };

    return {
      inline_keyboard: [
        [
          { text: "Участвовал(а)", callback_data: participantCallback(feedbackId, "a") },
          { text: "Не участвовал(а)", callback_data: participantCallback(feedbackId, "x") },
        ],
        [
          { text: "Событие не состоялось", callback_data: participantCallback(feedbackId, "n") },
        ],
        [openButton],
      ],
    };
  }

  return { inline_keyboard: [[openButton]] };
};
