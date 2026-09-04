import type {
  EventNotificationDelivery,
  EventNotificationKind,
} from "./types.js";

const headings: Record<EventNotificationKind, string> = {
  join_confirmed: "✅ Вы участвуете",
  join_pending: "⏳ Запрос отправлен",
  join_waitlisted: "🕐 Вы в списке ожидания",
  request_approved: "✅ Ваш запрос одобрен",
  request_rejected: "Запрос отклонён",
  event_changed: "✏️ Событие изменено",
  event_cancelled: "❌ Событие отменено",
  "social.favorited": "⭐ Вас добавили в избранное",
  "social.favorite_organizer_event_created": "⭐ Новое событие избранного организатора",
  "services.booking_requested": "🆕 Новый запрос на запись",
  "services.booking_confirmed": "✅ Запись подтверждена",
  "services.booking_declined": "❌ Запись отклонена",
  "services.booking_cancelled": "❌ Запись отменена",
  "services.booking_rescheduled": "🗓 Запись перенесена",
  "services.waitlist_slot_available": "🔔 Слот освободился",
  "post_event.organizer_confirmation": "✅ Подтвердите событие",
  "post_event.participant_confirmation": "👋 Подтвердите участие",
};

const postEventCopy = {
  ru: {
    organizer: "✅ Подтвердите событие",
    reminder: "⏰ Напоминание: подтвердите событие",
    participant: "👋 Подтвердите участие",
    organizerPrompt: "Состоялось ли это событие?",
    participantPrompt: "Вы были на этом событии?",
  },
  uk: {
    organizer: "✅ Підтвердьте подію",
    reminder: "⏰ Нагадування: підтвердьте подію",
    participant: "👋 Підтвердьте участь",
    organizerPrompt: "Чи відбулася ця подія?",
    participantPrompt: "Ви були на цій події?",
  },
  cs: {
    organizer: "✅ Potvrďte událost",
    reminder: "⏰ Připomenutí: potvrďte událost",
    participant: "👋 Potvrďte účast",
    organizerPrompt: "Proběhla tato událost?",
    participantPrompt: "Byli jste na této události?",
  },
  en: {
    organizer: "✅ Confirm the event",
    reminder: "⏰ Reminder: confirm the event",
    participant: "👋 Confirm attendance",
    organizerPrompt: "Did this event happen?",
    participantPrompt: "Did you attend this event?",
  },
} as const;

const localized = (
  value: EventNotificationDelivery["payload"]["title"],
  language: EventNotificationDelivery["language"],
) => value?.[language] || value?.ru || value?.cs || value?.en || value?.uk || "";

export const buildEventNotificationText = (delivery: EventNotificationDelivery) => {
  if (delivery.kind === "social.favorited") return headings[delivery.kind];

  const title = localized(delivery.payload.title, delivery.language)
    || localized(delivery.payload.activity, delivery.language)
    || "GO IRL";
  const eventDate = delivery.payload.eventDate || delivery.payload.date;
  const eventTime = delivery.payload.eventTime || delivery.payload.time;
  const when = [eventDate, eventTime?.slice(0, 5)].filter(Boolean).join(" · ");
  const details = [when, delivery.payload.cityName, delivery.payload.address, delivery.payload.counterpartName]
    .filter(Boolean)
    .join("\n");
  const organizer = delivery.kind === "social.favorite_organizer_event_created" && delivery.payload.organizerName
    ? `\nОрганизатор: ${delivery.payload.organizerName}`
    : "";
  const changes = delivery.kind === "event_changed" && delivery.payload.changedFields?.length
    ? `\nИзменено: ${delivery.payload.changedFields.join(", ")}`
    : "";
  const waitlistDisclaimer = delivery.kind === "services.waitlist_slot_available"
    && delivery.payload.reservationGuaranteed === false
    ? "\n\nМесто не зарезервировано — запись получит тот, кто оформит её первым."
    : "";
  const copy = postEventCopy[delivery.language];
  const postEventHeading = delivery.kind === "post_event.organizer_confirmation"
    ? delivery.payload.postEventStage === "organizer_reminder1" ? copy.reminder : copy.organizer
    : delivery.kind === "post_event.participant_confirmation"
      ? copy.participant
      : headings[delivery.kind];
  const postEventPrompt = delivery.kind === "post_event.organizer_confirmation"
    ? `\n\n${copy.organizerPrompt}`
    : delivery.kind === "post_event.participant_confirmation"
      ? `\n\n${copy.participantPrompt}`
      : "";
  return `${postEventHeading}\n\n${title}${details ? `\n${details}` : ""}${organizer}${changes}${waitlistDisclaimer}${postEventPrompt}`.trim();
};
