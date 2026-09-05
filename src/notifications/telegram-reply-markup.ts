import type { UserLanguage } from "../userLanguage.js";
import type { EventNotificationDelivery } from "./types.js";

type TelegramInlineButton = { text: string; callback_data: string } | { text: string; url: string };
const organizerCallback = (eventId: string, value: "h" | "n" | "p") => `pe:o:${eventId}:${value}`;
const participantCallback = (feedbackId: string, value: "a" | "x" | "n") => `pe:p:${feedbackId}:${value}`;
const postEventButtons: Record<UserLanguage, { openEvent: string; openApp: string; happened: string; notHappened: string; problem: string; attended: string; absent: string; eventMissing: string }> = {
  ru: { openEvent: "Открыть событие", openApp: "Открыть GO IRL", happened: "Состоялось", notHappened: "Не состоялось", problem: "Есть проблема", attended: "Участвовал(а)", absent: "Не участвовал(а)", eventMissing: "Событие не состоялось" },
  uk: { openEvent: "Відкрити подію", openApp: "Відкрити GO IRL", happened: "Відбулася", notHappened: "Не відбулася", problem: "Є проблема", attended: "Був(ла)", absent: "Не був(ла)", eventMissing: "Подія не відбулася" },
  cs: { openEvent: "Otevřít událost", openApp: "Otevřít GO IRL", happened: "Proběhla", notHappened: "Neproběhla", problem: "Nastal problém", attended: "Byl/a jsem", absent: "Nebyl/a jsem", eventMissing: "Událost se nekonala" },
  en: { openEvent: "Open event", openApp: "Open GO IRL", happened: "Happened", notHappened: "Did not happen", problem: "There was a problem", attended: "I attended", absent: "I did not attend", eventMissing: "Event did not happen" },
  pl: { openEvent: "Otwórz wydarzenie", openApp: "Otwórz GO IRL", happened: "Odbyło się", notHappened: "Nie odbyło się", problem: "Jest problem", attended: "Uczestniczyłem(-am)", absent: "Nie uczestniczyłem(-am)", eventMissing: "Wydarzenie się nie odbyło" },
  sk: { openEvent: "Otvoriť udalosť", openApp: "Otvoriť GO IRL", happened: "Uskutočnila sa", notHappened: "Neuskutočnila sa", problem: "Nastal problém", attended: "Zúčastnil/a som sa", absent: "Nezúčastnil/a som sa", eventMissing: "Udalosť sa neuskutočnila" },
};

export const buildEventNotificationTelegramReplyMarkup = (delivery: EventNotificationDelivery, openUrl: string) => {
  const copy = postEventButtons[delivery.language];
  const openButton: TelegramInlineButton = { text: delivery.payload.eventId || delivery.activityId ? copy.openEvent : copy.openApp, url: openUrl };
  if (delivery.kind === "post_event.organizer_confirmation") {
    const eventId = delivery.payload.eventId || delivery.activityId; if (!eventId) return { inline_keyboard: [[openButton]] };
    return { inline_keyboard: [[{ text: copy.happened, callback_data: organizerCallback(eventId, "h") }, { text: copy.notHappened, callback_data: organizerCallback(eventId, "n") }], [{ text: copy.problem, callback_data: organizerCallback(eventId, "p") }], [openButton]] };
  }
  if (delivery.kind === "post_event.participant_confirmation") {
    const feedbackId = delivery.payload.feedbackId; if (!feedbackId) return { inline_keyboard: [[openButton]] };
    return { inline_keyboard: [[{ text: copy.attended, callback_data: participantCallback(feedbackId, "a") }, { text: copy.absent, callback_data: participantCallback(feedbackId, "x") }], [{ text: copy.eventMissing, callback_data: participantCallback(feedbackId, "n") }], [openButton]] };
  }
  return { inline_keyboard: [[openButton]] };
};
