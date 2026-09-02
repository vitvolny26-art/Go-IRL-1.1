import type { Language } from "../types.js";
import type { ReminderChannel } from "../reminderPreferences.js";

export type EventNotificationKind =
  | "join_confirmed"
  | "join_pending"
  | "join_waitlisted"
  | "request_approved"
  | "request_rejected"
  | "event_changed"
  | "event_cancelled"
  | "services.booking_requested"
  | "services.booking_confirmed"
  | "services.booking_declined"
  | "services.booking_cancelled"
  | "services.booking_rescheduled"
  | "services.booking_reminder_24h"
  | "services.booking_reminder_3h"
  | "services.booking_visit_confirmation_24h"
  | "services.waitlist_slot_available"
  | "post_event.organizer_confirmation"
  | "post_event.participant_confirmation";

export type EventNotificationPayload = {
  eventId?: string;
  title?: Partial<Record<Language, string>>;
  activity?: Partial<Record<Language, string>>;
  date?: string;
  time?: string;
  address?: string;
  locationUrl?: string;
  cityId?: string;
  changedFields?: string[];
  subjectType?: "beauty_booking";
  bookingId?: string;
  bookingStatus?: string;
  waitlistId?: string;
  profileId?: string;
  serviceId?: string;
  reservationGuaranteed?: boolean;
  counterpartName?: string;
  sourceEventId?: string;
  feedbackId?: string;
  postEventStage?: "organizer_initial" | "organizer_reminder1" | "participant_confirmation";
  eventDate?: string;
  eventTime?: string;
  eventTimezone?: string;
  openPath?: string;
};

export type EventNotificationDelivery = {
  id: string;
  userKey: string;
  activityId?: string;
  kind: EventNotificationKind;
  payload: EventNotificationPayload;
  attemptCount: number;
  provider: ReminderChannel;
  recipientId: string;
  recipientLastInboundAt?: string;
  language: Language;
  openUrl: string;
};

export type EventNotificationOutcome =
  | { status: "sent"; providerMessageId?: string }
  | { status: "retry"; errorCode: string; retryAt: string }
  | { status: "failed"; errorCode: string }
  | { status: "cancelled"; reason: string };
