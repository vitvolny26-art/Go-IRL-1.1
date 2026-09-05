import { contentLanguageForUserLanguage, type UserLanguage } from "../userLanguage.js";
import type { EventNotificationDelivery, EventNotificationKind } from "./types.js";

type NotificationCopy = {
  headings: Record<EventNotificationKind, string>;
  organizerLabel: string;
  changedLabel: string;
  waitlistDisclaimer: string;
  postEvent: { organizer: string; reminder: string; participant: string; organizerPrompt: string; participantPrompt: string };
};

const copy: Record<UserLanguage, NotificationCopy> = {
  ru: {
    headings: { join_confirmed: "✅ Вы участвуете", join_pending: "⏳ Запрос отправлен", join_waitlisted: "🕐 Вы в списке ожидания", request_approved: "✅ Ваш запрос одобрен", request_rejected: "Запрос отклонён", event_changed: "✏️ Событие изменено", event_cancelled: "❌ Событие отменено", "social.favorited": "⭐ Вас добавили в избранное", "social.favorite_organizer_event_created": "⭐ Новое событие избранного организатора", "services.booking_requested": "🆕 Новый запрос на запись", "services.booking_confirmed": "✅ Запись подтверждена", "services.booking_declined": "❌ Запись отклонена", "services.booking_cancelled": "❌ Запись отменена", "services.booking_rescheduled": "🗓 Запись перенесена", "services.waitlist_slot_available": "🔔 Слот освободился", "post_event.organizer_confirmation": "✅ Подтвердите событие", "post_event.participant_confirmation": "👋 Подтвердите участие" },
    organizerLabel: "Организатор", changedLabel: "Изменено", waitlistDisclaimer: "Место не зарезервировано — запись получит тот, кто оформит её первым.",
    postEvent: { organizer: "✅ Подтвердите событие", reminder: "⏰ Напоминание: подтвердите событие", participant: "👋 Подтвердите участие", organizerPrompt: "Состоялось ли это событие?", participantPrompt: "Вы были на этом событии?" },
  },
  uk: {
    headings: { join_confirmed: "✅ Ви берете участь", join_pending: "⏳ Запит надіслано", join_waitlisted: "🕐 Ви у списку очікування", request_approved: "✅ Ваш запит схвалено", request_rejected: "Запит відхилено", event_changed: "✏️ Подію змінено", event_cancelled: "❌ Подію скасовано", "social.favorited": "⭐ Вас додали в обране", "social.favorite_organizer_event_created": "⭐ Нова подія улюбленого організатора", "services.booking_requested": "🆕 Новий запит на запис", "services.booking_confirmed": "✅ Запис підтверджено", "services.booking_declined": "❌ Запис відхилено", "services.booking_cancelled": "❌ Запис скасовано", "services.booking_rescheduled": "🗓 Запис перенесено", "services.waitlist_slot_available": "🔔 Звільнився слот", "post_event.organizer_confirmation": "✅ Підтвердьте подію", "post_event.participant_confirmation": "👋 Підтвердьте участь" },
    organizerLabel: "Організатор", changedLabel: "Змінено", waitlistDisclaimer: "Місце не зарезервовано — запис отримає той, хто оформить його першим.",
    postEvent: { organizer: "✅ Підтвердьте подію", reminder: "⏰ Нагадування: підтвердьте подію", participant: "👋 Підтвердьте участь", organizerPrompt: "Чи відбулася ця подія?", participantPrompt: "Ви були на цій події?" },
  },
  cs: {
    headings: { join_confirmed: "✅ Účastníte se", join_pending: "⏳ Žádost odeslána", join_waitlisted: "🕐 Jste na čekací listině", request_approved: "✅ Vaše žádost byla schválena", request_rejected: "Žádost zamítnuta", event_changed: "✏️ Událost byla změněna", event_cancelled: "❌ Událost byla zrušena", "social.favorited": "⭐ Někdo si vás přidal do oblíbených", "social.favorite_organizer_event_created": "⭐ Nová událost oblíbeného organizátora", "services.booking_requested": "🆕 Nová žádost o rezervaci", "services.booking_confirmed": "✅ Rezervace potvrzena", "services.booking_declined": "❌ Rezervace zamítnuta", "services.booking_cancelled": "❌ Rezervace zrušena", "services.booking_rescheduled": "🗓 Rezervace přesunuta", "services.waitlist_slot_available": "🔔 Uvolnil se termín", "post_event.organizer_confirmation": "✅ Potvrďte událost", "post_event.participant_confirmation": "👋 Potvrďte účast" },
    organizerLabel: "Organizátor", changedLabel: "Změněno", waitlistDisclaimer: "Místo není rezervované — termín získá ten, kdo rezervaci dokončí jako první.",
    postEvent: { organizer: "✅ Potvrďte událost", reminder: "⏰ Připomenutí: potvrďte událost", participant: "👋 Potvrďte účast", organizerPrompt: "Proběhla tato událost?", participantPrompt: "Byli jste na této události?" },
  },
  en: {
    headings: { join_confirmed: "✅ You're going", join_pending: "⏳ Request sent", join_waitlisted: "🕐 You're on the waitlist", request_approved: "✅ Your request was approved", request_rejected: "Request declined", event_changed: "✏️ Event updated", event_cancelled: "❌ Event cancelled", "social.favorited": "⭐ You were added to favorites", "social.favorite_organizer_event_created": "⭐ New event from a favorite organizer", "services.booking_requested": "🆕 New booking request", "services.booking_confirmed": "✅ Booking confirmed", "services.booking_declined": "❌ Booking declined", "services.booking_cancelled": "❌ Booking cancelled", "services.booking_rescheduled": "🗓 Booking rescheduled", "services.waitlist_slot_available": "🔔 A slot is available", "post_event.organizer_confirmation": "✅ Confirm the event", "post_event.participant_confirmation": "👋 Confirm attendance" },
    organizerLabel: "Organizer", changedLabel: "Changed", waitlistDisclaimer: "The slot is not reserved — it goes to whoever completes the booking first.",
    postEvent: { organizer: "✅ Confirm the event", reminder: "⏰ Reminder: confirm the event", participant: "👋 Confirm attendance", organizerPrompt: "Did this event happen?", participantPrompt: "Did you attend this event?" },
  },
  pl: {
    headings: { join_confirmed: "✅ Bierzesz udział", join_pending: "⏳ Prośba wysłana", join_waitlisted: "🕐 Jesteś na liście oczekujących", request_approved: "✅ Twoja prośba została zaakceptowana", request_rejected: "Prośba odrzucona", event_changed: "✏️ Wydarzenie zostało zmienione", event_cancelled: "❌ Wydarzenie zostało anulowane", "social.favorited": "⭐ Dodano Cię do ulubionych", "social.favorite_organizer_event_created": "⭐ Nowe wydarzenie ulubionego organizatora", "services.booking_requested": "🆕 Nowa prośba o rezerwację", "services.booking_confirmed": "✅ Rezerwacja potwierdzona", "services.booking_declined": "❌ Rezerwacja odrzucona", "services.booking_cancelled": "❌ Rezerwacja anulowana", "services.booking_rescheduled": "🗓 Rezerwacja przełożona", "services.waitlist_slot_available": "🔔 Zwolnił się termin", "post_event.organizer_confirmation": "✅ Potwierdź wydarzenie", "post_event.participant_confirmation": "👋 Potwierdź udział" },
    organizerLabel: "Organizator", changedLabel: "Zmieniono", waitlistDisclaimer: "Termin nie jest zarezerwowany — otrzyma go osoba, która pierwsza dokończy rezerwację.",
    postEvent: { organizer: "✅ Potwierdź wydarzenie", reminder: "⏰ Przypomnienie: potwierdź wydarzenie", participant: "👋 Potwierdź udział", organizerPrompt: "Czy to wydarzenie się odbyło?", participantPrompt: "Czy uczestniczyłeś(-aś) w tym wydarzeniu?" },
  },
  sk: {
    headings: { join_confirmed: "✅ Zúčastňujete sa", join_pending: "⏳ Žiadosť odoslaná", join_waitlisted: "🕐 Ste na čakacej listine", request_approved: "✅ Vaša žiadosť bola schválená", request_rejected: "Žiadosť zamietnutá", event_changed: "✏️ Udalosť bola zmenená", event_cancelled: "❌ Udalosť bola zrušená", "social.favorited": "⭐ Niekto si vás pridal medzi obľúbené", "social.favorite_organizer_event_created": "⭐ Nová udalosť obľúbeného organizátora", "services.booking_requested": "🆕 Nová žiadosť o rezerváciu", "services.booking_confirmed": "✅ Rezervácia potvrdená", "services.booking_declined": "❌ Rezervácia zamietnutá", "services.booking_cancelled": "❌ Rezervácia zrušená", "services.booking_rescheduled": "🗓 Rezervácia presunutá", "services.waitlist_slot_available": "🔔 Uvoľnil sa termín", "post_event.organizer_confirmation": "✅ Potvrďte udalosť", "post_event.participant_confirmation": "👋 Potvrďte účasť" },
    organizerLabel: "Organizátor", changedLabel: "Zmenené", waitlistDisclaimer: "Termín nie je rezervovaný — získa ho ten, kto dokončí rezerváciu ako prvý.",
    postEvent: { organizer: "✅ Potvrďte udalosť", reminder: "⏰ Pripomienka: potvrďte udalosť", participant: "👋 Potvrďte účasť", organizerPrompt: "Uskutočnila sa táto udalosť?", participantPrompt: "Zúčastnili ste sa tejto udalosti?" },
  },
};

const localized = (value: EventNotificationDelivery["payload"]["title"], language: EventNotificationDelivery["language"]) => {
  const contentLanguage = contentLanguageForUserLanguage(language);
  return value?.[contentLanguage] || value?.en || value?.ru || value?.cs || value?.uk || "";
};

export const buildEventNotificationText = (delivery: EventNotificationDelivery) => {
  const labels = copy[delivery.language];
  if (delivery.kind === "social.favorited") return labels.headings[delivery.kind];
  const title = localized(delivery.payload.title, delivery.language) || localized(delivery.payload.activity, delivery.language) || "GO IRL";
  const eventDate = delivery.payload.eventDate || delivery.payload.date;
  const eventTime = delivery.payload.eventTime || delivery.payload.time;
  const when = [eventDate, eventTime?.slice(0, 5)].filter(Boolean).join(" · ");
  const details = [when, delivery.payload.cityName, delivery.payload.address, delivery.payload.counterpartName].filter(Boolean).join("\n");
  const organizer = delivery.kind === "social.favorite_organizer_event_created" && delivery.payload.organizerName ? `\n${labels.organizerLabel}: ${delivery.payload.organizerName}` : "";
  const changes = delivery.kind === "event_changed" && delivery.payload.changedFields?.length ? `\n${labels.changedLabel}: ${delivery.payload.changedFields.join(", ")}` : "";
  const waitlistDisclaimer = delivery.kind === "services.waitlist_slot_available" && delivery.payload.reservationGuaranteed === false ? `\n\n${labels.waitlistDisclaimer}` : "";
  const postEventHeading = delivery.kind === "post_event.organizer_confirmation" ? delivery.payload.postEventStage === "organizer_reminder1" ? labels.postEvent.reminder : labels.postEvent.organizer : delivery.kind === "post_event.participant_confirmation" ? labels.postEvent.participant : labels.headings[delivery.kind];
  const postEventPrompt = delivery.kind === "post_event.organizer_confirmation" ? `\n\n${labels.postEvent.organizerPrompt}` : delivery.kind === "post_event.participant_confirmation" ? `\n\n${labels.postEvent.participantPrompt}` : "";
  return `${postEventHeading}\n\n${title}${details ? `\n${details}` : ""}${organizer}${changes}${waitlistDisclaimer}${postEventPrompt}`.trim();
};
