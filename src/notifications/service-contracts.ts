import type { Language } from "../types.js";
import type { EventNotificationKind } from "./types.js";
import type {
  NotificationChannel,
  NotificationDeepLink,
  NotificationKind,
  NotificationPayload,
  NotificationSubject,
} from "./contracts.js";

export const notificationServiceContractVersion = 1 as const;

export type NotificationCommandSource =
  | "participation"
  | "organizer"
  | "chat"
  | "review"
  | "favorites"
  | "weather"
  | "system"
  | "legacy_event_outbox";

export type NotificationCommand = {
  version: typeof notificationServiceContractVersion;
  commandId: string;
  source: NotificationCommandSource;
  kind: NotificationKind;
  occurrenceKey: string;
  subject: NotificationSubject;
  payload: NotificationPayload;
  deepLink?: NotificationDeepLink | null;
  actorUserKey?: string | null;
  recipientUserKeys?: readonly string[];
  activityId?: string | null;
  createdAt: string;
};

export type NotificationRecipient = {
  userKey: string;
  language: Language;
  eligible: boolean;
  reason?: "not_member" | "blocked" | "muted" | "missing_identity" | "unsupported";
};

export type NotificationChannelDecision = {
  channel: NotificationChannel;
  enabled: boolean;
  reason?: "preference_disabled" | "not_connected" | "not_configured" | "policy_blocked" | "window_closed" | "unsupported";
};

export type NotificationDeliveryIntent = {
  id: string;
  commandId: string;
  recipientUserKey: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  deduplicationKey: string;
  payload: NotificationPayload;
  deepLink?: NotificationDeepLink | null;
  availableAt: string;
  attemptCount: number;
  maxAttempts: number;
};

export type NotificationServicePlan = {
  command: NotificationCommand;
  recipients: readonly NotificationRecipient[];
  channelDecisions: Readonly<Record<string, readonly NotificationChannelDecision[]>>;
  inAppRecords: readonly NotificationDeliveryIntent[];
  externalDeliveries: readonly NotificationDeliveryIntent[];
};

export type NotificationDeliveryOutcome =
  | { status: "sent"; deliveredAt: string; providerMessageId?: string | null }
  | { status: "retry"; retryAt: string; errorCode: string }
  | { status: "failed"; failedAt: string; errorCode: string }
  | { status: "cancelled"; cancelledAt: string; reason: string }
  | { status: "deduplicated"; existingDeliveryId: string };

export type NotificationServicePolicy = {
  persistInAppFirst: true;
  externalDeliveryIsBestEffort: true;
  deduplicateBeforeDispatch: true;
  serviceCriticalBypassesUserDisable: true;
  providerFailureCreatesDeliveryProblem: true;
};

export const notificationServicePolicy: NotificationServicePolicy = {
  persistInAppFirst: true,
  externalDeliveryIsBestEffort: true,
  deduplicateBeforeDispatch: true,
  serviceCriticalBypassesUserDisable: true,
  providerFailureCreatesDeliveryProblem: true,
};

export const legacyEventNotificationKindMap: Readonly<Record<EventNotificationKind, NotificationKind>> = {
  join_confirmed: "participation.request_approved",
  join_pending: "participation.waitlisted",
  join_waitlisted: "participation.waitlisted",
  request_approved: "participation.request_approved",
  request_rejected: "participation.request_rejected",
  event_changed: "participation.event_time_changed",
  event_cancelled: "participation.event_cancelled",
  "services.booking_requested": "services.booking_requested",
  "services.booking_confirmed": "services.booking_confirmed",
  "services.booking_declined": "services.booking_declined",
  "services.booking_cancelled": "services.booking_cancelled",
  "services.booking_rescheduled": "services.booking_rescheduled",
  "services.waitlist_slot_available": "services.waitlist_slot_available",
};

export const buildNotificationDeliveryIdempotencyKey = (
  commandId: string,
  recipientUserKey: string,
  channel: NotificationChannel,
) => [commandId, recipientUserKey, channel].map(encodeURIComponent).join(":");

export const partitionDeliveryIntents = (intents: readonly NotificationDeliveryIntent[]) => ({
  inApp: intents.filter((intent) => intent.channel === "in_app"),
  external: intents.filter((intent) => intent.channel !== "in_app"),
});