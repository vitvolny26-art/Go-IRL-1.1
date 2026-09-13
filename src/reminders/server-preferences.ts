import { isTrustedAuthReady } from "../authSession.js";
import type { EventReminderPreference, ReminderChannel, ReminderLeadMinutes } from "../reminderPreferences.js";
import { supabase } from "../supabase.js";

type ReminderRow = {
  activity_id: string;
  provider: ReminderChannel;
  lead_minutes: ReminderLeadMinutes;
  event_starts_at: string;
  updated_at: string;
};

type CommunicationSettingsChannelRow = { channel?: string | null };

const reminderColumns = "activity_id,provider,lead_minutes,event_starts_at,updated_at";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let linkedReminderChannelsRequest: Promise<Set<ReminderChannel>> | null = null;

export const isServerActivityId = (activityId: string) => uuidPattern.test(activityId);
export const usesServerReminderPersistence = () => isTrustedAuthReady();

const mapReminder = (row: ReminderRow): EventReminderPreference => ({
  activityId: row.activity_id,
  channel: row.provider,
  leadMinutes: row.lead_minutes,
  eventStartsAt: row.event_starts_at,
  updatedAt: row.updated_at,
});

export async function readServerEventReminders(activityId: string) {
  if (!isServerActivityId(activityId)) return [];
  const { data, error } = await supabase
    .from("event_reminders")
    .select(reminderColumns)
    .eq("activity_id", activityId)
    .in("status", ["scheduled", "sending", "failed"])
    .order("lead_minutes", { ascending: true });
  if (error) throw error;
  return ((data || []) as ReminderRow[]).map(mapReminder);
}

export async function readServerEventReminder(activityId: string) {
  return (await readServerEventReminders(activityId))[0] || null;
}

export async function readLinkedReminderChannels() {
  if (!linkedReminderChannelsRequest) {
    linkedReminderChannelsRequest = (async (): Promise<Set<ReminderChannel>> => {
      const { data, error } = await supabase.rpc("go_irl_get_communication_settings");
      if (error) throw error;
      const channels = ((data || []) as CommunicationSettingsChannelRow[])
        .map((row) => row.channel)
        .filter((provider): provider is ReminderChannel =>
          typeof provider === "string"
          && ["in_app", "telegram", "whatsapp", "instagram", "messenger"].includes(provider));
      return new Set<ReminderChannel>(channels);
    })().catch((error) => {
      linkedReminderChannelsRequest = null;
      throw error;
    });
  }
  return linkedReminderChannelsRequest;
}

export async function saveServerEventReminder(activityId: string, provider: ReminderChannel, leadMinutes: ReminderLeadMinutes) {
  if (!isServerActivityId(activityId)) throw new Error("invalid_activity_id");
  const { error } = await supabase.rpc("go_irl_upsert_event_reminder", {
    p_activity_id: activityId,
    p_provider: provider,
    p_lead_minutes: leadMinutes,
  });
  if (error) throw error;
}

export async function replaceServerEventReminders(activityId: string, provider: ReminderChannel, leadMinutes: ReminderLeadMinutes[]) {
  if (!isServerActivityId(activityId)) throw new Error("invalid_activity_id");
  const normalized = Array.from(new Set(leadMinutes)).sort((a, b) => a - b);
  const { error } = await supabase.rpc("go_irl_replace_event_reminders", {
    p_activity_id: activityId,
    p_provider: provider,
    p_lead_minutes: normalized,
  });
  if (error) throw error;
}

export async function removeServerEventReminder(activityId: string) {
  if (!isServerActivityId(activityId)) return;
  const { error } = await supabase.from("event_reminders").delete().eq("activity_id", activityId);
  if (error) throw error;
}
