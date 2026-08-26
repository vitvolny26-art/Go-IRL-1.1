import type { EventNotificationDelivery, EventNotificationKind } from "./types.js";

const headings: Record<EventNotificationKind, string> = {
  join_confirmed: "✅ Вы участвуете",
  join_pending: "⏳ Запрос отправлен",
  join_waitlisted: "🕐 Вы в списке ожидания",
  request_approved: "✅ Ваш запрос одобрен",
  request_rejected: "Запрос отклонён",
  event_changed: "✏️ Событие изменено",
  event_cancelled: "❌ Событие отменено",
  "services.booking_requested": "🆕 Новый запрос на запись",
  "services.booking_confirmed": "✅ Запись подтверждена",
  "services.booking_declined": "❌ Запись отклонена",
  "services.booking_cancelled": "❌ Запись отменена",
  "services.booking_rescheduled": "🗓 Запись перенесена",
  "services.booking_reminder_24h": "⏰ Напоминание о записи завтра",
  "services.booking_reminder_3h": "⏰ Напоминание о записи через 3 часа",
  "services.booking_visit_confirmation_24h": "⭐ Как прошёл ваш визит?",
  "services.waitlist_slot_available": "🔔 Слот освободился",
};

const localized = (value: EventNotificationDelivery["payload"]["title"], language: EventNotificationDelivery["language"]) => value?.[language] || value?.ru || value?.cs || value?.en || value?.uk || "";

export const buildEventNotificationText = (delivery: EventNotificationDelivery) => {
  const title = localized(delivery.payload.title, delivery.language) || localized(delivery.payload.activity, delivery.language) || "GO IRL";
  const when = [delivery.payload.date, delivery.payload.time?.slice(0, 5)].filter(Boolean).join(" · ");
  const details = [when, delivery.payload.address, delivery.payload.counterpartName].filter(Boolean).join("\n");
  const changes = delivery.kind === "event_changed" && delivery.payload.changedFields?.length ? `\nИзменено: ${delivery.payload.changedFields.join(", ")}` : "";
  const waitlistDisclaimer = delivery.kind === "services.waitlist_slot_available" && delivery.payload.reservationGuaranteed === false ? "\n\nМесто не зарезервировано — запись получит тот, кто оформит её первым." : "";
  const visitPrompt = delivery.kind === "services.booking_visit_confirmation_24h" ? "\n\nПодтвердите, состоялся ли визит, и при желании поставьте оценку 1–5 и оставьте отзыв." : "";
  return `${headings[delivery.kind]}\n\n${title}${details ? `\n${details}` : ""}${changes}${waitlistDisclaimer}${visitPrompt}`.trim();
};
