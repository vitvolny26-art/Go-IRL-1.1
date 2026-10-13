import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

type TelegramApi = <T>(method: string, body?: Record<string, unknown>) => Promise<T>;
type Callback = {
  id?: string;
  data?: string;
  from?: { id?: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
};

const pattern = /^decline:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const participantName = (user: NonNullable<Callback["from"]>) =>
  [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
  || (user.username ? `@${user.username}` : "Участник");

export const handleActiv020InviteDecline = async ({
  supabase,
  telegramApi,
  callbackQuery,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  callbackQuery: Callback;
}) => {
  const match = callbackQuery.data?.match(pattern);
  if (!match) return { handled: false } as const;
  const telegramId = Number(callbackQuery.from?.id);
  if (!callbackQuery.id || !Number.isSafeInteger(telegramId) || telegramId <= 0 || !callbackQuery.from) {
    return { handled: true, rejected: "invalid_callback" } as const;
  }
  const answer = (message: string, alert = false) => telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQuery.id,
    text: message,
    show_alert: alert,
  });
  const activityId = match[1].toLowerCase();
  const event = await supabase.from("activities")
    .select("id,organizer_key,title_ru,title_cs,visibility")
    .eq("id", activityId).maybeSingle();
  if (event.error) throw event.error;
  if (!event.data || event.data.visibility === "private") {
    await answer("Событие недоступно", true);
    return { handled: true, rejected: "activity_unavailable" } as const;
  }

  const identity = await supabase.from("user_provider_identities")
    .select("user_key,status").eq("provider", "telegram")
    .eq("provider_user_id", String(telegramId)).maybeSingle();
  if (identity.error) throw identity.error;
  if (!identity.data || identity.data.status !== "active") {
    await answer("Откройте GO IRL, чтобы ответить на приглашение", true);
    return { handled: true, rejected: "identity_required" } as const;
  }
  const userKey = String(identity.data.user_key);
  if (userKey === event.data.organizer_key) {
    await answer("Организатор не может отказаться от собственного приглашения", true);
    return { handled: true, rejected: "organizer" } as const;
  }

  const name = participantName(callbackQuery.from);
  const inserted = await supabase.from("activity_invite_responses")
    .insert({ activity_id: activityId, user_key: userKey, display_name: name, response: "declined" })
    .select("activity_id").maybeSingle();
  const duplicate = inserted.error?.code === "23505";
  if (inserted.error && !duplicate) throw inserted.error;

  // A duplicate callback must never produce a second organizer notification.
  if (!duplicate && inserted.data) {
    const organizer = await supabase.from("user_provider_identities")
      .select("provider_user_id").eq("provider", "telegram")
      .eq("user_key", event.data.organizer_key).eq("status", "active")
      .not("consented_at", "is", null).maybeSingle();
    if (organizer.error) throw organizer.error;
    const organizerTelegramId = Number(organizer.data?.provider_user_id);
    if (Number.isSafeInteger(organizerTelegramId) && organizerTelegramId > 0) {
      const eventTitle = String(event.data.title_ru || event.data.title_cs || "GO IRL");
      try {
        const sent = await telegramApi<{ message_id?: number; chat?: { id?: number } }>("sendMessage", {
          chat_id: organizerTelegramId,
          text: `${name} — не идёт на событие «${eventTitle}».`,
          reply_markup: { inline_keyboard: [[{
            text: "Открыть событие",
            url: `https://t.me/GOirl_bot?startapp=${activityId}`,
          }]] },
        });
        if (!Number.isSafeInteger(sent?.message_id) || sent.message_id! <= 0 || sent.chat?.id !== organizerTelegramId) {
          console.error("activ020_decline_delivery_invalid_receipt", { activityId });
          throw new Error("telegram_delivery_receipt_invalid");
        }
        console.info("activ020_decline_delivery_accepted", { activityId, messageId: sent.message_id });
        const notified = await supabase.from("activity_invite_responses")
          .update({ organizer_notified_at: new Date().toISOString() })
          .eq("activity_id", activityId).eq("user_key", userKey);
        if (notified.error) throw notified.error;
      } catch (error) {
        console.error("activ020_decline_delivery_failed", { activityId, reason: error instanceof Error ? error.name : "unknown" });
        // Decline remains durable even if Telegram delivery fails.
      }
    } else {
      console.warn("activ020_decline_organizer_telegram_unavailable", { activityId });
    }
  }
  await answer("Ответ «Не иду» сохранён");
  return { handled: true, status: "declined", duplicate, activityId } as const;
};
