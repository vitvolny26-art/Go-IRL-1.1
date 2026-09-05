import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { hashProviderIdentitySubject } from "../_shared/deletedProviderIdentity.ts";

type TelegramApi = <T>(method: string, body?: Record<string, unknown>) => Promise<T>;

type TelegramCallbackUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type ActivityJoinCallbackQuery = {
  id?: string;
  data?: string;
  from?: TelegramCallbackUser;
  message?: {
    chat?: { id?: number; type?: string };
    message_id?: number;
  };
  inline_message_id?: string;
};

type AppUserRow = {
  user_key: string;
  status: string;
  language_code: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
};

type ProviderIdentityRow = {
  user_key: string;
  status: string;
};

type ActivityRow = {
  id: string;
  title_ru: string | null;
  title_cs: string | null;
  event_date: string;
  event_time: string | null;
  address: string;
  capacity: number;
  visibility: string;
  series_occurrence_status?: string | null;
};

type MemberStatus = "joined" | "waiting" | "pending";
type JoinStatus = "joined" | "already_joined" | "pending" | "waitlisted" | "full" | "private" | "closed";

const uuid = "([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})";
const joinPattern = new RegExp(`^join:${uuid}$`, "i");

const language = (value: string | null | undefined) => {
  const normalized = (value || "").toLowerCase();
  if (normalized.startsWith("uk")) return "uk";
  if (normalized.startsWith("cs")) return "cs";
  if (normalized.startsWith("en")) return "en";
  return "ru";
};

const copy = {
  ru: {
    details: "Подробнее",
    joined: "✅ Вы участвуете.",
    already_joined: "✅ Вы уже участвуете.",
    pending: "⏳ Заявка отправлена организатору.",
    waitlisted: "🕒 Вы в листе ожидания.",
    full: "Сейчас свободных мест нет.",
    private: "Для этой активности требуется приглашение.",
    closed: "Эта активность уже закрыта.",
    failed: "Не удалось подтвердить участие. Попробуйте ещё раз.",
  },
  uk: {
    details: "Докладніше",
    joined: "✅ Ви берете участь.",
    already_joined: "✅ Ви вже берете участь.",
    pending: "⏳ Заявку надіслано організатору.",
    waitlisted: "🕒 Ви в списку очікування.",
    full: "Зараз вільних місць немає.",
    private: "Для цієї активності потрібне запрошення.",
    closed: "Цю активність уже закрито.",
    failed: "Не вдалося підтвердити участь. Спробуйте ще раз.",
  },
  cs: {
    details: "Podrobnosti",
    joined: "✅ Účast je potvrzena.",
    already_joined: "✅ Už se účastníte.",
    pending: "⏳ Žádost byla odeslána organizátorovi.",
    waitlisted: "🕒 Jste na čekací listině.",
    full: "Aktuálně nejsou volná místa.",
    private: "Pro tuto aktivitu je potřeba pozvánka.",
    closed: "Tato aktivita už je uzavřená.",
    failed: "Účast se nepodařilo potvrdit. Zkuste to znovu.",
  },
  en: {
    details: "Details",
    joined: "✅ You're participating.",
    already_joined: "✅ You're already participating.",
    pending: "⏳ Your request was sent to the organizer.",
    waitlisted: "🕒 You’re on the waitlist.",
    full: "There are no free spots right now.",
    private: "This activity requires an invitation.",
    closed: "This activity is already closed.",
    failed: "Could not confirm participation. Please try again.",
  },
} as const;

export const parseActivityJoinCallback = (value: string | undefined) => {
  const match = value?.match(joinPattern);
  return match ? { activityId: match[1].toLowerCase() } : null;
};

const pragueDateKey = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const displayName = (user: TelegramCallbackUser) =>
  [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
  || (user.username ? `@${user.username}` : "GO IRL User");

const resolveTelegramUser = async (
  supabase: SupabaseClient,
  user: TelegramCallbackUser,
) => {
  const telegramUserId = Number(user.id);
  const providerUserId = String(telegramUserId);
  const now = new Date().toISOString();

  const identityResult = await supabase
    .from("user_provider_identities")
    .select("user_key,status")
    .eq("provider", "telegram")
    .eq("provider_user_id", providerUserId)
    .maybeSingle();
  if (identityResult.error) throw identityResult.error;

  const identity = identityResult.data as ProviderIdentityRow | null;
  if (identity) {
    const appUserResult = await supabase
      .from("app_users")
      .select("user_key,status,language_code,first_name,last_name,username")
      .eq("user_key", identity.user_key)
      .maybeSingle();
    if (appUserResult.error) throw appUserResult.error;
    const appUser = appUserResult.data as AppUserRow | null;
    if (!appUser) throw new Error("telegram_user_missing");
    if (appUser.status !== "active") return { rejected: appUser.status } as const;

    const inboundResult = await supabase
      .from("user_provider_identities")
      .update({ last_inbound_at: now, updated_at: now })
      .eq("provider", "telegram")
      .eq("provider_user_id", providerUserId);
    if (inboundResult.error) throw inboundResult.error;

    return { userKey: appUser.user_key, languageCode: appUser.language_code || user.language_code || null } as const;
  }

  const deletedSubjectHash = await hashProviderIdentitySubject("telegram", providerUserId);
  const deletedResult = await supabase
    .from("deleted_provider_identities")
    .select("subject_hash")
    .eq("provider", "telegram")
    .eq("subject_hash", deletedSubjectHash)
    .maybeSingle();
  if (deletedResult.error) throw deletedResult.error;
  if (deletedResult.data) return { rejected: "deleted" } as const;

  const userKey = `telegram:${providerUserId}`;
  const appUserResult = await supabase.from("app_users").upsert({
    auth_provider: "telegram",
    provider_user_id: providerUserId,
    user_key: userKey,
    telegram_id: telegramUserId,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    username: user.username?.trim().toLowerCase() || null,
    language_code: user.language_code || null,
    updated_at: now,
  }, { onConflict: "auth_provider,provider_user_id" })
    .select("user_key,status,language_code,first_name,last_name,username")
    .single();
  if (appUserResult.error || !appUserResult.data) throw appUserResult.error || new Error("telegram_user_upsert_failed");
  const appUser = appUserResult.data as AppUserRow;
  if (appUser.status !== "active") return { rejected: appUser.status } as const;

  const identityUpsert = await supabase.from("user_provider_identities").upsert({
    user_key: appUser.user_key,
    provider: "telegram",
    provider_user_id: providerUserId,
    status: "active",
    last_inbound_at: now,
    updated_at: now,
  }, { onConflict: "provider,provider_user_id" });
  if (identityUpsert.error) throw identityUpsert.error;

  return { userKey: appUser.user_key, languageCode: appUser.language_code || user.language_code || null } as const;
};

const existingJoinStatus = (status: string | undefined): JoinStatus | null => {
  if (status === "joined") return "already_joined";
  if (status === "pending") return "pending";
  if (status === "waiting") return "waitlisted";
  return null;
};

const eventDetailsUrl = (activityId: string) => `https://go-irl.fun/join/${activityId}`;

const detailedFeedback = (text: string, activity: ActivityRow) => {
  const title = (activity.title_ru || activity.title_cs || "GO IRL").trim() || "GO IRL";
  const dateTime = [activity.event_date, activity.event_time?.slice(0, 5)].filter(Boolean).join(" · ");
  return [text, "", title, dateTime, activity.address].filter(Boolean).join("\n");
};

const sendFeedback = async ({
  telegramApi,
  callbackQuery,
  telegramUserId,
  activity,
  status,
  languageCode,
}: {
  telegramApi: TelegramApi;
  callbackQuery: ActivityJoinCallbackQuery;
  telegramUserId: number;
  activity: ActivityRow;
  status: JoinStatus;
  languageCode: string | null;
}) => {
  const callbackId = callbackQuery.id!;
  const text = copy[language(languageCode)];
  const shortText = text[status];

  await telegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: shortText,
    show_alert: status === "private" || status === "closed",
  });

  const chatId = callbackQuery.message?.chat?.id;
  const chatType = callbackQuery.message?.chat?.type;
  if (!Number.isSafeInteger(chatId) || !["group", "supergroup"].includes(chatType || "")) {
    return { ephemeral: false } as const;
  }
  try {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: detailedFeedback(shortText, activity),
      ephemeral_message_parameters: {
        receiver_user_id: telegramUserId,
        callback_query_id: callbackId,
        replace_callback_query_message: true,
      },
      reply_markup: {
        inline_keyboard: [[{ text: text.details, url: eventDetailsUrl(activity.id) }]],
      },
    });
    return { ephemeral: true } as const;
  } catch {
    // The membership result is durable. Ephemeral delivery is best-effort and
    // answerCallbackQuery above remains the private fallback for inline shares.
    return { ephemeral: false } as const;
  }
};

export const handleActivityJoinCallback = async ({
  supabase,
  telegramApi,
  callbackQuery,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  callbackQuery: ActivityJoinCallbackQuery;
  now?: Date;
}) => {
  const parsed = parseActivityJoinCallback(callbackQuery.data);
  if (!parsed) return { handled: false } as const;

  const callbackId = callbackQuery.id;
  const telegramUserId = Number(callbackQuery.from?.id);
  if (!callbackId || !Number.isSafeInteger(telegramUserId) || telegramUserId <= 0 || !callbackQuery.from) {
    return { handled: true, rejected: "invalid_callback" } as const;
  }

  try {
    const resolved = await resolveTelegramUser(supabase, callbackQuery.from);
    if ("rejected" in resolved) {
      await telegramApi<boolean>("answerCallbackQuery", {
        callback_query_id: callbackId,
        text: copy[language(callbackQuery.from.language_code)].failed,
        show_alert: true,
      });
      return { handled: true, rejected: `user_${resolved.rejected}` } as const;
    }

    const activityResult = await supabase
      .from("activities")
      .select("id,title_ru,title_cs,event_date,event_time,address,capacity,visibility,series_occurrence_status")
      .eq("id", parsed.activityId)
      .maybeSingle();
    if (activityResult.error) throw activityResult.error;
    const activity = activityResult.data as ActivityRow | null;
    if (!activity) {
      await telegramApi<boolean>("answerCallbackQuery", {
        callback_query_id: callbackId,
        text: copy[language(resolved.languageCode)].failed,
        show_alert: true,
      });
      return { handled: true, rejected: "activity_missing" } as const;
    }

    const existingResult = await supabase
      .from("activity_members")
      .select("status")
      .eq("activity_id", activity.id)
      .eq("user_key", resolved.userKey)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;
    const existing = existingJoinStatus((existingResult.data as { status?: string } | null)?.status);
    if (existing) {
      const feedback = await sendFeedback({
        telegramApi,
        callbackQuery,
        telegramUserId,
        activity,
        status: existing,
        languageCode: resolved.languageCode,
      });
      return { handled: true, activityId: activity.id, userKey: resolved.userKey, status: existing, ...feedback } as const;
    }

    let status: JoinStatus;
    if (activity.series_occurrence_status === "cancelled" || activity.event_date < pragueDateKey(now)) {
      status = "closed";
    } else if (activity.visibility === "private") {
      status = "private";
    } else if (activity.visibility === "invite") {
      status = "pending";
    } else if (activity.visibility === "public") {
      const joinedResult = await supabase
        .from("activity_members")
        .select("activity_id", { count: "exact", head: true })
        .eq("activity_id", activity.id)
        .eq("status", "joined");
      if (joinedResult.error) throw joinedResult.error;
      status = Number(joinedResult.count || 0) >= activity.capacity ? "full" : "joined";
    } else {
      status = "private";
    }

    if (status === "joined" || status === "pending") {
      const insertResult = await supabase.from("activity_members").insert({
        activity_id: activity.id,
        user_key: resolved.userKey,
        display_name: displayName(callbackQuery.from),
        status: status as MemberStatus,
      });
      if (insertResult.error) {
        if (insertResult.error.code !== "23505") throw insertResult.error;
        const racedResult = await supabase
          .from("activity_members")
          .select("status")
          .eq("activity_id", activity.id)
          .eq("user_key", resolved.userKey)
          .maybeSingle();
        if (racedResult.error) throw racedResult.error;
        status = existingJoinStatus((racedResult.data as { status?: string } | null)?.status) || "already_joined";
      }
    }

    const feedback = await sendFeedback({
      telegramApi,
      callbackQuery,
      telegramUserId,
      activity,
      status,
      languageCode: resolved.languageCode,
    });
    return { handled: true, activityId: activity.id, userKey: resolved.userKey, status, ...feedback } as const;
  } catch {
    try {
      await telegramApi<boolean>("answerCallbackQuery", {
        callback_query_id: callbackId,
        text: copy[language(callbackQuery.from.language_code)].failed,
        show_alert: true,
      });
    } catch {
      // Keep webhook response bounded even if Telegram feedback also fails.
    }
    return { handled: true, rejected: "join_failed" } as const;
  }
};
