import { buildOrganizerSurveyKeyboard } from "../../api/_shared/post-event-organizer-survey.js";
import type { UserLanguage } from "../userLanguage.js";
import type { EventNotificationDelivery } from "./types.js";

type TelegramInlineButton = { text: string; callback_data: string } | { text: string; url: string };
const participantCallback = (feedbackId: string, value: "a" | "x" | "n") => `pe:p:${feedbackId}:${value}`;
const postEventButtons: Record<UserLanguage, { openEvent: string; openApp: string; attended: string; absent: string; eventMissing: string }> = {
  ru: { openEvent: "Открыть событие", openApp: "Открыть GO IRL", attended: "Участвовал(а)", absent: "Не участвовал(а)", eventMissing: "Событие не состоялось" },
  uk: { openEvent: "Відкрити подію", openApp: "Відкрити GO IRL", attended: "Був(ла)", absent: "Не був(ла)", eventMissing: "Подія не відбулася" },
  cs: { openEvent: "Otevřít událost", openApp: "Otevřít GO IRL", attended: "Byl/a jsem", absent: "Nebyl/a jsem", eventMissing: "Událost se nekonala" },
  en: { openEvent: "Open event", openApp: "Open GO IRL", attended: "I attended", absent: "I did not attend", eventMissing: "Event did not happen" },
  pl: { openEvent: "Otwórz wydarzenie", openApp: "Otwórz GO IRL", attended: "Uczestniczyłem(-am)", absent: "Nie uczestniczyłem(-am)", eventMissing: "Wydarzenie się nie odbyło" },
  sk: { openEvent: "Otvoriť udalosť", openApp: "Otvoriť GO IRL", attended: "Zúčastnil/a som sa", absent: "Nezúčastnil/a som sa", eventMissing: "Udalosť sa neuskutočnila" },
};

export const buildEventNotificationTelegramReplyMarkup = (delivery: EventNotificationDelivery, openUrl: string) => {
  if (delivery.kind === "activity.organizer_join_alert") return { inline_keyboard: [] };
  const copy = postEventButtons[delivery.language];
  const openButton: TelegramInlineButton = { text: delivery.payload.eventId || delivery.activityId ? copy.openEvent : copy.openApp, url: openUrl };
  if (delivery.kind === "post_event.organizer_confirmation") {
    if (delivery.payload.postEventStage === "organizer_cleanup" || delivery.payload.postEventStage === "organizer_feedback") return { inline_keyboard: [] };
    const eventId = delivery.payload.eventId || delivery.activityId;
    if (!eventId) return { inline_keyboard: [] };
    return buildOrganizerSurveyKeyboard(delivery.language, "outcome", eventId);
  }
  if (delivery.kind === "post_event.participant_confirmation") {
    const feedbackId = delivery.payload.feedbackId; if (!feedbackId) return { inline_keyboard: [[openButton]] };
    return { inline_keyboard: [[{ text: copy.attended, callback_data: participantCallback(feedbackId, "a") }, { text: copy.absent, callback_data: participantCallback(feedbackId, "x") }], [{ text: copy.eventMissing, callback_data: participantCallback(feedbackId, "n") }], [openButton]] };
  }
  return { inline_keyboard: [[openButton]] };
};
