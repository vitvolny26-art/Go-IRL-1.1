import type { Language } from "../types.js";
import type { ReminderChannel } from "../reminderPreferences.js";

export const notificationContractVersion = 1 as const;

export type NotificationCategory =
  | "participation"
  | "organizer"
  | "social"
  | "communication"
  | "post_event"
  | "weather"
  | "services"
  | "system";

export type NotificationKind =
  | "participation.request_approved"
  | "participation.request_rejected"
  | "participation.place_available"
  | "participation.waitlisted"
  | "participation.event_cancelled"
  | "participation.event_time_changed"
  | "participation.event_location_changed"
  | "participation.reminder_day"
  | "participation.reminder_hour"
  | "participation.bad_weather"
  | "organizer.new_request"
  | "organizer.participant_left"
  | "organizer.three_places_left"
  | "organizer.one_place_left"
  | "organizer.event_full"
  | "social.rating_received"
  | "social.review_received"
  | "social.favorited"
  | "social.favorite_organizer_event_created"
  | "communication.announcement"
  | "communication.message"
  | "communication.reply"
  | "communication.mention"
  | "post_event.rate_event"
  | "post_event.leave_review"
  | "post_event.organizer_confirmation"
  | "post_event.participant_confirmation"
  | "weather.rain"
  | "weather.thunderstorm"
  | "weather.strong_wind"
  | "weather.heat"
  | "weather.frost"
  | "services.booking_requested"
  | "services.booking_confirmed"
  | "services.booking_declined"
  | "services.booking_cancelled"
  | "services.booking_rescheduled"
  | "services.waitlist_slot_available"
  | "system.delivery_problem";

export type NotificationSubjectType =
  | "activity"
  | "team"
  | "chat"
  | "message"
  | "review"
  | "profile"
  | "beauty_booking"
  | "weather_alert"
  | "system";

export type NotificationActor = {
  userKey: string;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type NotificationSubject = {
  type: NotificationSubjectType;
  id: string;
};

export type NotificationDeepLink = {
  view: "home" | "discover" | "explore" | "profile" | "activity" | "team" | "chat" | "review" | "services";
  entityId?: string;
  messageId?: string;
  query?: Record<string, string>;
};

export type NotificationPayload = {
  version: typeof notificationContractVersion;
  title?: Partial<Record<Language, string>>;
  body?: Partial<Record<Language, string>>;
  activityId?: string;
  teamId?: string;
  chatId?: string;
  messageId?: string;
  reviewId?: string;
  bookingId?: string;
  waitlistId?: string;
  profileId?: string;
  serviceId?: string;
  reservationGuaranteed?: boolean;
  feedbackId?: string;
  postEventStage?: "organizer_initial" | "organizer_reminder1" | "participant_confirmation";
  eventDate?: string;
  eventTime?: string;
  eventTimezone?: string;
  changedFields?: string[];
  metadata?: Record<string, string | number | boolean | null>;
};

export type NotificationRecord = {
  id: string;
  recipientUserKey: string;
  kind: NotificationKind;
  category: NotificationCategory;
  actor?: NotificationActor | null;
  subject: NotificationSubject;
  payload: NotificationPayload;
  deepLink?: NotificationDeepLink | null;
  deduplicationKey: string;
  serviceCritical: boolean;
  createdAt: string;
  readAt?: string | null;
  openedAt?: string | null;
  expiresAt?: string | null;
};

export type NotificationChannel = "in_app" | ReminderChannel;

export type NotificationChannelCapability = {
  channel: NotificationChannel;
  available: boolean;
  connected: boolean;
  supportsServiceCritical: boolean;
  supportsTransactional: boolean;
  reason?: "not_connected" | "not_configured" | "policy_blocked" | "unsupported";
};

export type NotificationPreference = {
  userKey: string;
  kind: NotificationKind;
  inAppEnabled: boolean;
  channels: NotificationChannel[];
  mutedUntil?: string | null;
  updatedAt: string;
};

export type NotificationRegistryEntry = {
  kind: NotificationKind;
  category: NotificationCategory;
  serviceCritical: boolean;
  defaultChannels: readonly NotificationChannel[];
  retentionDays: number;
};

const registry = <T extends readonly NotificationRegistryEntry[]>(entries: T) => entries;

export const notificationRegistry = registry([
  { kind: "participation.request_approved", category: "participation", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 90 },
  { kind: "participation.request_rejected", category: "participation", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 90 },
  { kind: "participation.place_available", category: "participation", serviceCritical: false, defaultChannels: ["in_app", "telegram"], retentionDays: 30 },
  { kind: "participation.waitlisted", category: "participation", serviceCritical: true, defaultChannels: ["in_app"], retentionDays: 90 },
  { kind: "participation.event_cancelled", category: "participation", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 180 },
  { kind: "participation.event_time_changed", category: "participation", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 90 },
  { kind: "participation.event_location_changed", category: "participation", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 90 },
  { kind: "participation.reminder_day", category: "participation", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 14 },
  { kind: "participation.reminder_hour", category: "participation", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 14 },
  { kind: "participation.bad_weather", category: "participation", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 14 },
  { kind: "organizer.new_request", category: "organizer", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 90 },
  { kind: "organizer.participant_left", category: "organizer", serviceCritical: true, defaultChannels: ["in_app"], retentionDays: 90 },
  { kind: "organizer.three_places_left", category: "organizer", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 30 },
  { kind: "organizer.one_place_left", category: "organizer", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 30 },
  { kind: "organizer.event_full", category: "organizer", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 30 },
  { kind: "social.rating_received", category: "social", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 180 },
  { kind: "social.review_received", category: "social", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 180 },
  { kind: "social.favorited", category: "social", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 30 },
  { kind: "social.favorite_organizer_event_created", category: "social", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 30 },
  { kind: "communication.announcement", category: "communication", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 90 },
  { kind: "communication.message", category: "communication", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 30 },
  { kind: "communication.reply", category: "communication", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 30 },
  { kind: "communication.mention", category: "communication", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 30 },
  { kind: "post_event.rate_event", category: "post_event", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 14 },
  { kind: "post_event.leave_review", category: "post_event", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 14 },
  { kind: "post_event.organizer_confirmation", category: "post_event", serviceCritical: false, defaultChannels: ["in_app", "telegram"], retentionDays: 14 },
  { kind: "post_event.participant_confirmation", category: "post_event", serviceCritical: false, defaultChannels: ["in_app", "telegram"], retentionDays: 14 },
  { kind: "weather.rain", category: "weather", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 7 },
  { kind: "weather.thunderstorm", category: "weather", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 7 },
  { kind: "weather.strong_wind", category: "weather", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 7 },
  { kind: "weather.heat", category: "weather", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 7 },
  { kind: "weather.frost", category: "weather", serviceCritical: false, defaultChannels: ["in_app"], retentionDays: 7 },
  { kind: "services.booking_requested", category: "services", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 90 },
  { kind: "services.booking_confirmed", category: "services", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 90 },
  { kind: "services.booking_declined", category: "services", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 90 },
  { kind: "services.booking_cancelled", category: "services", serviceCritical: true, defaultChannels: ["in_app", "telegram"], retentionDays: 90 },
  { kind: "services.waitlist_slot_available", category: "services", serviceCritical: false, defaultChannels: ["in_app", "telegram"], retentionDays: 30 },
  { kind: "system.delivery_problem", category: "system", serviceCritical: true, defaultChannels: ["in_app"], retentionDays: 30 },
] as const);

export const notificationRegistryByKind = new Map<NotificationKind, NotificationRegistryEntry>(
  notificationRegistry.map((entry) => [entry.kind, entry]),
);

export const getNotificationRegistryEntry = (kind: NotificationKind) => {
  const entry = notificationRegistryByKind.get(kind);
  if (!entry) throw new Error(`unknown_notification_kind:${kind}`);
  return entry;
};

export const buildNotificationDeduplicationKey = (
  recipientUserKey: string,
  kind: NotificationKind,
  subject: NotificationSubject,
  occurrenceKey: string,
) => [recipientUserKey, kind, subject.type, subject.id, occurrenceKey].map(encodeURIComponent).join(":");

export const canDisableNotification = (kind: NotificationKind) =>
  !getNotificationRegistryEntry(kind).serviceCritical;
