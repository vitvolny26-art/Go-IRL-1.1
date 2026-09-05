import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { contentLanguageForUserLanguage, localeForUserLanguage, resolveUserLanguage, type UserLanguage } from "../userLanguage.js";
import type { ReminderChannel, ReminderLeadMinutes } from "../reminderPreferences.js";
import type { ReminderWorkerRepository } from "./worker.js";
import type { ReminderDelivery, ReminderDeliveryOutcome } from "./types.js";

type ReminderRow = { id: string; delivery_key: string; user_key: string; activity_id: string; provider: ReminderChannel; lead_minutes: ReminderLeadMinutes; attempt_count: number };
type IdentityRow = { provider_user_id: string; status: "active" | "revoked"; consented_at: string | null; last_inbound_at: string | null };
type ActivityRow = { id: string; title_ru: string; title_cs: string; event_date: string; event_time: string; address: string; location_url: string | null };
type AppUserRow = { language_code: string | null };

export type ReminderRepositoryConfig = { supabaseUrl: string; serviceRoleKey: string; publicOrigin: string; providers: ReminderChannel[]; leaseSeconds?: number; language?: UserLanguage };

const pad = (value: number) => String(value).padStart(2, "0");
const calendarUrl = (event: ActivityRow, title: string, openUrl: string) => {
  const [year, month, day] = event.event_date.split("-").map(Number);
  const [hour, minute] = event.event_time.slice(0, 5).split(":").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const end = new Date(start.getTime() + 90 * 60_000);
  const compact = (date: Date) => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${compact(start)}/${compact(end)}`, details: openUrl, location: event.address, ctz: "Europe/Prague" }).toString()}`;
};

const displayDateTime = (event: ActivityRow, language: UserLanguage) => {
  const date = new Date(`${event.event_date}T12:00:00Z`);
  const formatted = Number.isNaN(date.getTime()) ? event.event_date : new Intl.DateTimeFormat(localeForUserLanguage(language), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  return `${formatted} · ${event.event_time.slice(0, 5)}`;
};

export function hydrateReminderDelivery(input: { reminder: ReminderRow; identity: IdentityRow | null; event: ActivityRow | null; publicOrigin: string; language: UserLanguage }): ReminderDelivery {
  const { reminder, identity, event, language } = input;
  const origin = input.publicOrigin.replace(/\/+$/, "");
  const contentLanguage = contentLanguageForUserLanguage(language);
  const openUrl = `${origin}/api/meta/event-preview?event=${encodeURIComponent(reminder.activity_id)}&language=${contentLanguage}`;
  const title = event ? ((contentLanguage === "cs" ? event.title_cs : event.title_ru) || event.title_ru) : "GO IRL";
  const cancelReason = !identity ? "provider_identity_missing" : identity.status !== "active" ? "provider_identity_revoked" : !identity.consented_at ? "provider_consent_missing" : !event ? "event_missing" : undefined;
  return {
    reminderId: reminder.id, deliveryKey: reminder.delivery_key, provider: reminder.provider,
    recipientId: identity?.provider_user_id || "",
    ...(identity?.last_inbound_at ? { recipientLastInboundAt: identity.last_inbound_at } : {}),
    ...(cancelReason ? { cancelReason } : {}), leadMinutes: reminder.lead_minutes, language, attemptCount: reminder.attempt_count,
    event: { eventId: reminder.activity_id, title, dateTime: event ? displayDateTime(event, language) : "", location: event?.address || "", openUrl,
      ...(event ? { calendarUrl: calendarUrl(event, title, openUrl) } : {}),
      ...(event?.location_url ? { mapUrl: event.location_url } : event?.address ? { mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}` } : {}) },
  };
}

const retryAt = (outcome: ReminderDeliveryOutcome) => outcome.status === "retry" ? outcome.retryAt : null;
const errorCode = (outcome: ReminderDeliveryOutcome) => outcome.status === "retry" || outcome.status === "failed" ? outcome.errorCode : outcome.status === "cancelled" ? outcome.reason : null;

export class SupabaseReminderRepository implements ReminderWorkerRepository {
  private readonly client: SupabaseClient;
  private readonly leaseSeconds: number;
  private readonly languageOverride: UserLanguage | null;
  constructor(private readonly config: ReminderRepositoryConfig) {
    this.client = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    this.leaseSeconds = Math.min(Math.max(config.leaseSeconds ?? 300, 30), 1800);
    this.languageOverride = config.language || null;
  }
  async claim(limit: number): Promise<ReminderDelivery[]> {
    const { data, error } = await this.client.rpc("go_irl_claim_due_event_reminders", { p_limit: limit, p_lease_seconds: this.leaseSeconds, p_providers: this.config.providers });
    if (error) throw new Error(`reminder_claim_failed:${error.code || "unknown"}`);
    return Promise.all(((data || []) as ReminderRow[]).map(async (reminder) => {
      const [identityResult, eventResult, userResult] = await Promise.all([
        this.client.from("user_provider_identities").select("provider_user_id,status,consented_at,last_inbound_at").eq("user_key", reminder.user_key).eq("provider", reminder.provider).maybeSingle(),
        this.client.from("activities").select("id,title_ru,title_cs,event_date,event_time,address,location_url").eq("id", reminder.activity_id).maybeSingle(),
        this.client.from("app_users").select("language_code").eq("user_key", reminder.user_key).maybeSingle(),
      ]);
      if (identityResult.error) throw new Error(`reminder_identity_load_failed:${identityResult.error.code || "unknown"}`);
      if (eventResult.error) throw new Error(`reminder_event_load_failed:${eventResult.error.code || "unknown"}`);
      if (userResult.error) throw new Error(`reminder_language_load_failed:${userResult.error.code || "unknown"}`);
      return hydrateReminderDelivery({ reminder, identity: identityResult.data as IdentityRow | null, event: eventResult.data as ActivityRow | null, publicOrigin: this.config.publicOrigin, language: this.languageOverride || resolveUserLanguage((userResult.data as AppUserRow | null)?.language_code) });
    }));
  }
  async finish(reminderId: string, outcome: ReminderDeliveryOutcome) {
    const { error } = await this.client.rpc("go_irl_finish_event_reminder", { p_reminder_id: reminderId, p_outcome: outcome.status, p_error_code: errorCode(outcome), p_retry_at: retryAt(outcome) });
    if (error) throw new Error(`reminder_finish_failed:${error.code || "unknown"}`);
  }
}
