import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { validateTelegramInitData } from "../_shared/telegramInitData.ts";

const eventIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const joinActiv020SignedMiniAppInvitation = async ({
  supabase, initData, eventId, botToken,
}: {
  supabase: SupabaseClient;
  initData: unknown;
  eventId: unknown;
  botToken: string;
}) => {
  if (typeof initData !== "string" || initData.length > 8192 ||
      typeof eventId !== "string" || !eventIdPattern.test(eventId)) {
    return { status: 400, body: { error: "invalid_invite_request" } };
  }
  let verified;
  try {
    verified = await validateTelegramInitData({ initData, botToken });
  } catch {
    return { status: 401, body: { error: "invalid_telegram_session" } };
  }
  // Only a cryptographically signed Telegram launch for this event grants admission.
  if (verified.startParam?.toLowerCase() !== eventId.toLowerCase()) {
    return { status: 403, body: { error: "invitation_required" } };
  }
  const identity = await supabase.from("user_provider_identities").select("user_key,status")
    .eq("provider", "telegram").eq("provider_user_id", String(verified.user.id)).maybeSingle();
  if (identity.error) throw identity.error;
  if (!identity.data || identity.data.status !== "active") {
    return { status: 403, body: { error: "active_identity_required" } };
  }
  const userKey = String(identity.data.user_key);
  const account = await supabase.from("app_users").select("status").eq("user_key", userKey).maybeSingle();
  if (account.error) throw account.error;
  if (account.data?.status !== "active") {
    return { status: 403, body: { error: "active_account_required" } };
  }
  const event = await supabase.from("activities")
    .select("id,organizer_key,visibility,event_date,capacity,series_occurrence_status")
    .eq("id", eventId).maybeSingle();
  if (event.error) throw event.error;
  if (!event.data || event.data.visibility !== "invite") {
    return { status: 404, body: { error: "invitation_unavailable" } };
  }
  if (event.data.organizer_key === userKey) return { status: 200, body: { status: "joined" } };
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (event.data.series_occurrence_status === "cancelled" || event.data.event_date < today) {
    return { status: 409, body: { error: "event_closed" } };
  }
  const member = await supabase.from("activity_members").select("status")
    .eq("activity_id", eventId).eq("user_key", userKey).maybeSingle();
  if (member.error) throw member.error;
  if (member.data?.status === "joined") return { status: 200, body: { status: "joined" } };
  const joined = await supabase.from("activity_members").select("activity_id", { count: "exact", head: true })
    .eq("activity_id", eventId).eq("status", "joined");
  if (joined.error) throw joined.error;
  if (Number(joined.count || 0) >= Number(event.data.capacity)) {
    return { status: 409, body: { error: "event_full" } };
  }
  if (member.data?.status === "pending" || member.data?.status === "waiting") {
    const updated = await supabase.from("activity_members")
      .update({ status: "joined" }).eq("activity_id", eventId).eq("user_key", userKey)
      .select("status").single();
    if (updated.error) throw updated.error;
  } else {
    const name = [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ").trim()
      || (verified.user.username ? `@${verified.user.username}` : "GO IRL User");
    const inserted = await supabase.from("activity_members").insert({
      activity_id: eventId, user_key: userKey, display_name: name, status: "joined",
    });
    if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
  }
  return { status: 200, body: { status: "joined" } };
};
