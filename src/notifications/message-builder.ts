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
  "social.favorite_organizer_event_created": "⭐ Новое событие избранного организатора",
  "services.booking_requested": "🆕 Новый запрос на запись",
  "services.booking_confirmed": "✅ Запись подтверждена",
  "services.booking_declined": "❌ Запись отклонена",
  "services.booking_cancelled": "❌ Запись отменена",
  "services.booking_rescheduled": "🗓 Запись перенесена",
  "services.waitlist_slot_available": "🔔 Слот освободился",
};

const localized = (
  value: EventNotificationDelivery["payload"]["title"],
  language: EventNotificationDelivery["language"],
) => value?.[language] || value?.ru || value?.cs || value?.en || value?.uk || "";

export const buildEventNotificationText = (delivery: EventNotificationDelivery) => {
  const title = localized(delivery.payload.title, delivery.language)
    || localized(delivery.payload.activity, delivery.language)
    || "GO IRL";
  const when = [delivery.payload.date, delivery.payload.time?.slice(0, 5)].filter(Boolean).join(" · ");
  const details = [when, delivery.payload.address, delivery.payload.counterpartName]
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
  return `${headings[delivery.kind]}\n\n${title}${details ? `\n${details}` : ""}${organizer}${changes}${waitlistDisclaimer}`.trim();
};
