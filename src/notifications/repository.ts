import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveUserLanguage } from "../userLanguage.js";
import type { ReminderChannel } from "../reminderPreferences.js";
import { buildPostEventActivityPath } from "../postEventEntry.js";
import type { EventNotificationDelivery, EventNotificationOutcome, EventNotificationPayload } from "./types.js";

type ClaimRow = { id: string; user_key: string; activity_id: string | null; kind: EventNotificationDelivery["kind"]; payload: EventNotificationPayload; attempt_count: number; provider: ReminderChannel; provider_user_id: string; recipient_last_inbound_at: string | null; language_code: string | null };
export const buildEventNotificationOpenUrl = (origin: string, payload: EventNotificationPayload, activityId: string | null) => { const base = origin.replace(/\/$/, ""); if (payload.openPath?.startsWith("/")) return `${base}${payload.openPath}`; const eventId = payload.eventId || activityId || ""; if (eventId && payload.postEventStage) { const feedbackId = payload.postEventStage === "participant_confirmation" ? payload.feedbackId : undefined; return `${base}${buildPostEventActivityPath(eventId, feedbackId)}`; } return `${base}/join/${encodeURIComponent(eventId)}`; };
export class EventNotificationRepository {
  private readonly client: SupabaseClient;
  constructor(supabaseUrl: string, serviceRoleKey: string, private readonly origin: string, private readonly providers: ReminderChannel[]) { this.client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }); }
  async claim(limit = 50): Promise<EventNotificationDelivery[]> {
    const { data, error } = await this.client.rpc("go_irl_claim_event_notifications", { p_providers: this.providers, p_limit: limit, p_lease_seconds: 300 });
    if (error) throw new Error(`notification_claim_failed:${error.code || "unknown"}`);
    return ((data || []) as ClaimRow[]).map((row) => ({ id: row.id, userKey: row.user_key, ...(row.activity_id ? { activityId: row.activity_id } : {}), kind: row.kind, payload: row.payload, attemptCount: row.attempt_count, provider: row.provider, recipientId: row.provider_user_id, ...(row.recipient_last_inbound_at ? { recipientLastInboundAt: row.recipient_last_inbound_at } : {}), language: resolveUserLanguage(row.language_code), openUrl: buildEventNotificationOpenUrl(this.origin, row.payload, row.activity_id) }));
  }
  async finish(id: string, outcome: EventNotificationOutcome) { const retryAt = outcome.status === "retry" ? outcome.retryAt : null; const errorCode = outcome.status === "failed" ? outcome.errorCode : outcome.status === "retry" ? outcome.errorCode : outcome.status === "cancelled" ? outcome.reason : null; const { error } = await this.client.rpc("go_irl_finish_event_notification", { p_notification_id: id, p_outcome: outcome.status, p_error_code: errorCode, p_retry_at: retryAt, p_provider_message_id: outcome.status === "sent" ? outcome.providerMessageId || null : null }); if (error) throw new Error(`notification_finish_failed:${error.code || "unknown"}`); }
}
