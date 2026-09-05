import type { UserLanguage } from "../userLanguage.js";
import type { ReminderChannel, ReminderLeadMinutes } from "../reminderPreferences.js";

export type ReminderDeliveryStatus =
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

export type ReminderAction = {
  kind: "open" | "calendar" | "map";
  label: string;
  url: string;
};

export type ReminderEventSummary = {
  eventId: string;
  title: string;
  dateTime: string;
  location: string;
  openUrl: string;
  calendarUrl?: string;
  mapUrl?: string;
  imageUrl?: string;
};

export type ReminderDelivery = {
  reminderId: string;
  deliveryKey: string;
  provider: ReminderChannel;
  recipientId: string;
  recipientLastInboundAt?: string;
  cancelReason?: string;
  leadMinutes: ReminderLeadMinutes;
  language: UserLanguage;
  attemptCount: number;
  event: ReminderEventSummary;
};

export type ReminderMessage = {
  heading: string;
  body: string;
  actions: ReminderAction[];
};

export type ReminderDeliveryOutcome =
  | { status: "sent"; providerMessageId?: string }
  | { status: "retry"; errorCode: string; retryAt: string }
  | { status: "failed"; errorCode: string }
  | { status: "cancelled"; reason: string };
