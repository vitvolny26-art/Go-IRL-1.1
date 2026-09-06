import { createClient } from "@supabase/supabase-js";
import type { JoinProvider, JoinResult, JoinResultAction } from "../../src/join/types.js";
import type { MetaEventSummary } from "../../src/meta-messaging/types.js";
import { requireEnv } from "./env.js";
import { loadTrustedTelegramEventCard } from "./telegram-share-event.js";

type ActivityRow = {
  id: string;
  title_ru: string;
  event_date: string;
  event_time: string;
  city_id: string;
  address: string;
  location_url: string | null;
  capacity: number;
};

const getAdminClient = () => createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const calendarUrl = (activity: ActivityRow) => {
  const start = `${activity.event_date.replaceAll("-", "")}T${activity.event_time.slice(0, 5).replace(":", "")}00`;
  const [year, month, day] = activity.event_date.split("-").map(Number);
  const [hour, minute] = activity.event_time.slice(0, 5).split(":").map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const endDate = new Date(startDate.getTime() + 90 * 60 * 1000);
  const end = `${endDate.getUTCFullYear()}${String(endDate.getUTCMonth() + 1).padStart(2, "0")}${String(endDate.getUTCDate()).padStart(2, "0")}T${String(endDate.getUTCHours()).padStart(2, "0")}${String(endDate.getUTCMinutes()).padStart(2, "0")}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: activity.title_ru,
    dates: `${start}/${end}`,
    location: activity.address,
    ctz: "Europe/Prague",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const eventActions = (activity: ActivityRow): JoinResultAction[] => {
  const mapUrl = activity.location_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.address)}`;
  return [
    { kind: "calendar", label: "Add to calendar", url: calendarUrl(activity) },
    { kind: "map", label: "Open map", url: mapUrl },
  ];
};

export async function getProviderEvent(eventId: string) {
  const client = getAdminClient();
  const { data, error } = await client
    .from("activities")
    .select("id,title_ru,event_date,event_time,city_id,address,location_url,capacity")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data as ActivityRow | null;
}

export async function getProviderEventSummary(eventId: string): Promise<MetaEventSummary | null> {
  const card = await loadTrustedTelegramEventCard(eventId, "ru");
  if (!card) return null;
  return {
    ...card,
    language: "ru",
    dateTime: [card.date, card.time].filter(Boolean).join(" · "),
    location: card.address,
    availableSpots: Math.max(card.capacity - card.participants, 0),
  };
}

async function resolveProviderUserKey(provider: Exclude<JoinProvider, "telegram">, providerUserId: string, displayName: string) {
  const client = getAdminClient();
  const ensureIdentity = async (userKey: string) => {
    const { error } = await client.from("user_provider_identities").upsert({
      user_key: userKey,
      provider,
      provider_user_id: providerUserId,
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider,provider_user_id" });
    if (error) throw error;
    return userKey;
  };
  const existing = await client
    .from("app_users")
    .select("user_key,status")
    .eq("auth_provider", provider)
    .eq("provider_user_id", providerUserId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === "blocked" || existing.data?.status === "deleted") throw new Error("provider_user_blocked");
  if (existing.data?.user_key) return ensureIdentity(existing.data.user_key as string);

  const userKey = `user:${crypto.randomUUID()}`;
  const { error } = await client.from("app_users").insert({
    auth_provider: provider,
    provider_user_id: providerUserId,
    user_key: userKey,
    first_name: displayName.slice(0, 120) || "GO IRL User",
    last_login_at: new Date().toISOString(),
  });
  if (!error) return ensureIdentity(userKey);
  const raced = await client
    .from("app_users")
    .select("user_key")
    .eq("auth_provider", provider)
    .eq("provider_user_id", providerUserId)
    .single();
  if (raced.error) throw raced.error;
  return ensureIdentity(raced.data.user_key as string);
}

export async function recordProviderInbound(input: {
  provider: Exclude<JoinProvider, "telegram">;
  providerUserId: string;
  displayName: string;
}) {
  const userKey = await resolveProviderUserKey(
    input.provider,
    input.providerUserId,
    input.displayName,
  );
  return { userKey };
}

export async function setProviderNotificationConsent(input: {
  provider: Exclude<JoinProvider, "telegram">;
  providerUserId: string;
  displayName: string;
  consented: boolean;
}) {
  const userKey = await resolveProviderUserKey(
    input.provider,
    input.providerUserId,
    input.displayName,
  );
  const client = getAdminClient();
  const now = new Date().toISOString();
  const { error: identityError } = await client
    .from("user_provider_identities")
    .update({
      status: input.consented ? "active" : "revoked",
      consented_at: input.consented ? now : null,
      last_inbound_at: now,
      updated_at: now,
    })
    .eq("user_key", userKey)
    .eq("provider", input.provider);
  if (identityError) throw identityError;

  if (!input.consented) {
    const { error: reminderError } = await client
      .from("event_reminders")
      .update({
        status: "cancelled",
        next_attempt_at: null,
        leased_at: null,
        last_error_code: "provider_opted_out",
        updated_at: now,
      })
      .eq("user_key", userKey)
      .eq("provider", input.provider)
      .in("status", ["scheduled", "failed", "sending"]);
    if (reminderError) throw reminderError;
    const { error: notificationError } = await client
      .from("event_notifications")
      .update({
        status: "cancelled",
        next_attempt_at: null,
        leased_at: null,
        last_error_code: "provider_opted_out",
        updated_at: now,
      })
      .eq("user_key", userKey)
      .eq("provider", input.provider)
      .in("status", ["scheduled", "failed", "sending"]);
    if (notificationError) throw notificationError;
  }

  return { userKey, consented: input.consented };
}

export async function joinProviderEvent(input: {
  provider: "whatsapp" | "instagram" | "messenger";
  providerUserId: string;
  displayName: string;
  eventId: string;
}): Promise<JoinResult> {
  const activity = await getProviderEvent(input.eventId);
  if (!activity) return { status: "rejected", eventId: input.eventId, reason: "event_not_found", actions: [] };
  const userKey = await resolveProviderUserKey(input.provider, input.providerUserId, input.displayName);
  const client = getAdminClient();
  const { data, error } = await client.rpc("go_irl_provider_join", {
    p_activity_id: input.eventId,
    p_user_key: userKey,
    p_display_name: input.displayName.slice(0, 120) || "GO IRL User",
  });
  if (error) throw error;
  const status = Array.isArray(data) ? data[0]?.status : data?.status;
  const actions = eventActions(activity);
  if (status === "joined" || status === "already_joined" || status === "pending") {
    return { status, eventId: input.eventId, actions };
  }
  if (status === "waitlisted") return { status, eventId: input.eventId, reason: "event_full", actions };
  const reason = status === "event_closed" || status === "event_full" || status === "not_allowed"
    ? status
    : "event_not_found";
  return { status: "rejected", eventId: input.eventId, reason, actions: [] };
}
