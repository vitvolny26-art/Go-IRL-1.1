import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureActivitySharePublicAlias, persistActivityShareCard } from "./activity-share-card-storage.js";
import { buildTelegramEventCard } from "./telegram-event-card.js";
import { createTelegramShareCardToken } from "./telegram-share-card-token.js";
import { loadTrustedTelegramEventCard, type ShareLanguage } from "./telegram-share-event.js";
import {
  activityDateLabel,
  activityEndsAt,
  buildCitySendPhotoPayload,
  readCityTelegramPublicationState,
  resolveCityTelegramChatId,
  withCityTelegramPublicationState,
  type CityTelegramPublicationState,
} from "./telegram-city-publication-core.js";

export type TelegramApi = <T>(method: string, body?: Record<string, unknown>) => Promise<T>;

export type CityActivityRow = {
  id: string;
  organizer_key: string;
  title_ru: string | null;
  title_cs: string | null;
  event_date: string;
  event_time: string | null;
  city_id: string | null;
  activity_type: string | null;
  visibility: string;
  metadata: Record<string, unknown> | null;
};

type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
  invite_link?: string;
  is_forum?: boolean;
};

type ExternalChatRow = {
  url: string | null;
  telegram_chat_id: number | null;
  telegram_chat_type: string | null;
  telegram_chat_title: string | null;
  telegram_message_thread_id: number | null;
  topic_delete_after: string | null;
  topic_deleted_at: string | null;
};

const telegramMediaOrigin = "https://go-irl-1-1.vercel.app";
const shareLanguages: readonly ShareLanguage[] = ["ru", "uk", "cs", "en"];

const normalizeTelegramChatUrl = (value: string | null | undefined) => {
  const trimmed = value?.trim() || "";
  return /^https:\/\/t\.me\/(?:joinchat\/[-_A-Za-z0-9]+|\+[-_A-Za-z0-9]+|[A-Za-z0-9_]{5,})(?:\/[0-9]+)?$/.test(trimmed)
    ? trimmed
    : null;
};

const telegramUsernameUrl = (value: string | null | undefined) => {
  const username = (value || "").replace(/^@/, "");
  return /^[A-Za-z0-9_]{5,}$/.test(username) ? `https://t.me/${username}` : null;
};

const forumTopicUrl = (chatId: number, messageThreadId: number) => {
  const raw = String(chatId);
  if (!raw.startsWith("-100") || !Number.isSafeInteger(messageThreadId) || messageThreadId <= 0) {
    throw new Error("telegram_forum_topic_url_invalid");
  }
  return `https://t.me/c/${raw.slice(4)}/${messageThreadId}`;
};

const cityLabel = (cityId: string | null) => {
  if (cityId === "praha") return "Praha";
  if (cityId === "olomouc") return "Olomouc";
  return cityId || "GO IRL";
};

const loadActivity = async (supabase: SupabaseClient, activityId: string) => {
  const result = await supabase
    .from("activities")
    .select("id,organizer_key,title_ru,title_cs,event_date,event_time,city_id,activity_type,visibility,metadata")
    .eq("id", activityId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data as CityActivityRow | null;
};

const updateActivityMetadata = async (
  supabase: SupabaseClient,
  activityId: string,
  update: (metadata: Record<string, unknown> | null) => Record<string, unknown>,
) => {
  const current = await supabase.from("activities").select("metadata").eq("id", activityId).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) throw new Error("activity_not_found");
  const metadata = (current.data.metadata || null) as Record<string, unknown> | null;
  const saved = await supabase.from("activities").update({ metadata: update(metadata) }).eq("id", activityId);
  if (saved.error) throw saved.error;
};

const ensureChatUrl = async (telegramApi: TelegramApi, chatId: number, activityId: string) => {
  const chat = await telegramApi<TelegramChat>("getChat", { chat_id: chatId });
  if (chat.id !== chatId || !["group", "supergroup"].includes(chat.type)) throw new Error("telegram_city_chat_invalid");
  let url = telegramUsernameUrl(chat.username) || normalizeTelegramChatUrl(chat.invite_link);
  if (!url) {
    const invite = await telegramApi<{ invite_link: string }>("createChatInviteLink", {
      chat_id: chatId,
      name: `GO IRL ${activityId}`.slice(0, 32),
    });
    url = normalizeTelegramChatUrl(invite.invite_link);
  }
  if (!url) throw new Error("telegram_city_chat_url_unavailable");
  return { chat, url };
};

const ensureCityBinding = async (
  supabase: SupabaseClient,
  telegramApi: TelegramApi,
  activity: CityActivityRow,
  chatId: number,
) => {
  const { chat, url } = await ensureChatUrl(telegramApi, chatId, activity.id);
  const now = new Date().toISOString();
  const result = await supabase.from("activity_external_telegram_chats").upsert({
    activity_id: activity.id,
    url,
    attached_by_user_key: activity.organizer_key,
    telegram_chat_id: chatId,
    telegram_chat_type: chat.type,
    telegram_chat_title: chat.title || cityLabel(activity.city_id),
    bound_at: now,
    updated_at: now,
  }, { onConflict: "activity_id" });
  if (result.error) throw result.error;
  return { chat, url };
};

const buildCanonicalShare = async (activityId: string, language: ShareLanguage, botToken: string) => {
  const cards = await Promise.all(shareLanguages.map((item) => loadTrustedTelegramEventCard(activityId, item)));
  const card = cards[shareLanguages.indexOf(language)];
  if (!card) throw new Error("event_not_found");
  if (card.visibility !== "public") throw new Error("activity_not_public");
  const alias = await ensureActivitySharePublicAlias(card);
  await Promise.all(cards
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => persistActivityShareCard(item, alias)));
  const image = new URL("/api/telegram/event-share-card", telegramMediaOrigin);
  image.searchParams.set("token", createTelegramShareCardToken(card, botToken));
  return { card, inlineCard: buildTelegramEventCard(card, image.toString()) };
};

export const publishCanonicalCityActivity = async ({
  supabase,
  telegramApi,
  botToken,
  activityId,
  language = "cs",
  organizerKey,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  botToken: string;
  activityId: string;
  language?: ShareLanguage;
  organizerKey?: string;
}) => {
  const activity = await loadActivity(supabase, activityId);
  if (!activity) return { published: false, skipped: "missing" } as const;
  if (organizerKey && activity.organizer_key !== organizerKey) throw new Error("organizer_required");
  if (activity.visibility !== "public") return { published: false, skipped: "visibility" } as const;
  const chatId = resolveCityTelegramChatId(activity.city_id);
  if (!chatId) return { published: false, skipped: "city" } as const;

  const existing = readCityTelegramPublicationState(activity.metadata);
  if (existing?.active && existing.activityId === activity.id && existing.chatId === chatId) {
    await ensureCityBinding(supabase, telegramApi, activity, chatId);
    await telegramApi<boolean>("pinChatMessage", {
      chat_id: chatId,
      message_id: existing.messageId,
      disable_notification: true,
    });
    return { published: true, reused: true, chatId, messageId: existing.messageId } as const;
  }

  const { inlineCard } = await buildCanonicalShare(activity.id, language, botToken);
  const message = await telegramApi<{ message_id: number }>("sendPhoto", buildCitySendPhotoPayload(chatId, inlineCard));
  if (!Number.isSafeInteger(message.message_id) || message.message_id <= 0) throw new Error("telegram_send_photo_invalid_response");

  try {
    await telegramApi<boolean>("pinChatMessage", {
      chat_id: chatId,
      message_id: message.message_id,
      disable_notification: true,
    });
    await ensureCityBinding(supabase, telegramApi, activity, chatId);
    const now = new Date().toISOString();
    const state: CityTelegramPublicationState = {
      activityId: activity.id,
      active: true,
      chatId,
      messageId: message.message_id,
      pinnedAt: now,
      unpinAt: activityEndsAt(activity).toISOString(),
    };
    await updateActivityMetadata(supabase, activity.id, (metadata) => withCityTelegramPublicationState(metadata, state));
    return { published: true, reused: false, chatId, messageId: message.message_id, unpinAt: state.unpinAt } as const;
  } catch (error) {
    try {
      await telegramApi<boolean>("unpinChatMessage", { chat_id: chatId, message_id: message.message_id });
    } catch {
      // Best effort rollback of a partial publish.
    }
    try {
      await telegramApi<boolean>("deleteMessage", { chat_id: chatId, message_id: message.message_id });
    } catch {
      // Best effort rollback of a partial publish.
    }
    throw error;
  }
};

const isAlreadyUnpinned = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("message to unpin not found") || message.includes("message is not pinned");
};

export const unpinDueCanonicalCityActivities = async ({
  supabase,
  telegramApi,
  now = new Date(),
  limit = 100,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  now?: Date;
  limit?: number;
}) => {
  const result = await supabase
    .from("activities")
    .select("id,organizer_key,title_ru,title_cs,event_date,event_time,city_id,activity_type,visibility,metadata")
    .contains("metadata", { cityTelegramPublication: { active: true } })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (result.error) throw result.error;

  let checked = 0;
  let unpinned = 0;
  let failed = 0;
  for (const activity of (result.data || []) as CityActivityRow[]) {
    const state = readCityTelegramPublicationState(activity.metadata);
    if (!state?.active || state.activityId !== activity.id) continue;
    checked += 1;
    const dueAt = new Date(state.unpinAt);
    if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() > now.getTime()) continue;
    try {
      try {
        await telegramApi<boolean>("unpinChatMessage", { chat_id: state.chatId, message_id: state.messageId });
      } catch (error) {
        if (!isAlreadyUnpinned(error)) throw error;
      }
      const nextState: CityTelegramPublicationState = {
        ...state,
        active: false,
        unpinnedAt: now.toISOString(),
      };
      await updateActivityMetadata(supabase, activity.id, (metadata) => withCityTelegramPublicationState(metadata, nextState));
      unpinned += 1;
    } catch {
      failed += 1;
    }
  }
  return { checked, unpinned, failed };
};

const activeTelegramUserId = async (supabase: SupabaseClient, userKey: string) => {
  const identity = await supabase
    .from("user_provider_identities")
    .select("provider_user_id")
    .eq("user_key", userKey)
    .eq("provider", "telegram")
    .eq("status", "active")
    .not("consented_at", "is", null)
    .maybeSingle();
  if (identity.error) throw identity.error;
  const telegramUserId = Number(identity.data?.provider_user_id);
  return Number.isSafeInteger(telegramUserId) && telegramUserId > 0 ? telegramUserId : null;
};

const isTelegramMember = (status: string | undefined) => Boolean(status && !["left", "kicked"].includes(status));

export const syncJoinedParticipantTelegramAccess = async ({
  supabase,
  telegramApi,
  activityId,
  actorUserKey,
  memberUserKey,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  activityId: string;
  actorUserKey: string;
  memberUserKey?: string;
}) => {
  const activity = await loadActivity(supabase, activityId);
  if (!activity) return { prompted: false, skipped: "missing" } as const;
  const targetUserKey = memberUserKey || actorUserKey;
  if (memberUserKey && targetUserKey !== actorUserKey && activity.organizer_key !== actorUserKey) {
    throw new Error("organizer_required");
  }

  const membership = await supabase
    .from("activity_members")
    .select("status")
    .eq("activity_id", activityId)
    .eq("user_key", targetUserKey)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (membership.data?.status !== "joined") return { prompted: false, skipped: "not_joined" } as const;

  const telegramUserId = await activeTelegramUserId(supabase, targetUserKey);
  if (!telegramUserId) return { prompted: false, skipped: "telegram_identity" } as const;

  let chatId: number | null = null;
  let inviteUrl: string | null = null;
  if (activity.visibility === "public") {
    chatId = resolveCityTelegramChatId(activity.city_id);
    if (!chatId) return { prompted: false, skipped: "city" } as const;
    const binding = await ensureCityBinding(supabase, telegramApi, activity, chatId);
    inviteUrl = binding.url;
  } else {
    const binding = await supabase
      .from("activity_external_telegram_chats")
      .select("url,telegram_chat_id,telegram_chat_type,telegram_chat_title,telegram_message_thread_id,topic_delete_after,topic_deleted_at")
      .eq("activity_id", activityId)
      .maybeSingle();
    if (binding.error) throw binding.error;
    const row = binding.data as ExternalChatRow | null;
    chatId = row?.telegram_chat_id || null;
    inviteUrl = normalizeTelegramChatUrl(row?.url);
    if (!chatId || !inviteUrl || row?.topic_deleted_at) return { prompted: false, skipped: "activity_chat" } as const;
  }

  const member = await telegramApi<{ status?: string }>("getChatMember", {
    chat_id: chatId,
    user_id: telegramUserId,
  });
  if (isTelegramMember(member.status)) return { prompted: false, alreadyMember: true, chatId } as const;

  let participantInviteUrl = inviteUrl;
  try {
    const invite = await telegramApi<{ invite_link: string }>("createChatInviteLink", {
      chat_id: chatId,
      name: `GO IRL ${activity.id}`.slice(0, 32),
      expire_date: Math.floor(Date.now() / 1000) + 30 * 60,
      member_limit: 1,
    });
    participantInviteUrl = normalizeTelegramChatUrl(invite.invite_link) || inviteUrl;
  } catch {
    // Existing verified chat URL remains the non-fatal fallback.
  }

  await telegramApi<{ message_id: number }>("sendMessage", {
    chat_id: telegramUserId,
    text: activity.visibility === "public"
      ? `Ты подтверждён в событии GO IRL. Вступи в городской Telegram-чат ${cityLabel(activity.city_id)}, если хочешь получать обновления.`
      : "Ты подтверждён в событии GO IRL. Telegram-чат события доступен по кнопке ниже.",
    reply_markup: {
      inline_keyboard: [[{ text: "Вступить в Telegram-чат", url: participantInviteUrl }]],
    },
  });
  return { prompted: true, chatId } as const;
};

export const createCanonicalCityTopic = async ({
  supabase,
  telegramApi,
  activityId,
  organizerKey,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  activityId: string;
  organizerKey: string;
}) => {
  const activity = await loadActivity(supabase, activityId);
  if (!activity) throw new Error("activity_not_found");
  if (activity.organizer_key !== organizerKey) throw new Error("organizer_required");
  if (activity.visibility !== "public") throw new Error("activity_not_public");
  const chatId = resolveCityTelegramChatId(activity.city_id);
  if (!chatId) throw new Error("city_not_supported");

  const existing = await supabase
    .from("activity_external_telegram_chats")
    .select("url,telegram_chat_id,telegram_chat_type,telegram_chat_title,telegram_message_thread_id,topic_delete_after,topic_deleted_at")
    .eq("activity_id", activity.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  const existingRow = existing.data as ExternalChatRow | null;
  if (existingRow?.telegram_chat_id === chatId && existingRow.telegram_message_thread_id && !existingRow.topic_deleted_at && existingRow.url) {
    return {
      inviteUrl: existingRow.url,
      topicUrl: forumTopicUrl(chatId, existingRow.telegram_message_thread_id),
      messageThreadId: existingRow.telegram_message_thread_id,
      title: existingRow.telegram_chat_title || cityLabel(activity.city_id),
      deleteAfter: existingRow.topic_delete_after || new Date(activityEndsAt(activity).getTime() + 24 * 60 * 60_000).toISOString(),
      reused: true,
    };
  }

  const binding = await ensureCityBinding(supabase, telegramApi, activity, chatId);
  if (binding.chat.type !== "supergroup" || !binding.chat.is_forum) throw new Error("telegram_event_supergroup_forum_required");
  const card = await loadTrustedTelegramEventCard(activity.id, "cs");
  const activityTitle = card?.activity || activity.title_cs || activity.title_ru || "GO IRL event";
  const title = `${cityLabel(activity.city_id)} / ${activityTitle} / ${activityDateLabel(activity.event_date)}`.slice(0, 128);
  const created = await telegramApi<{ message_thread_id: number; name?: string }>("createForumTopic", {
    chat_id: chatId,
    name: title,
  });
  const now = new Date().toISOString();
  const deleteAfter = new Date(activityEndsAt(activity).getTime() + 24 * 60 * 60_000).toISOString();
  const save = await supabase.from("activity_external_telegram_chats").upsert({
    activity_id: activity.id,
    url: binding.url,
    attached_by_user_key: activity.organizer_key,
    telegram_chat_id: chatId,
    telegram_chat_type: binding.chat.type,
    telegram_chat_title: binding.chat.title || cityLabel(activity.city_id),
    bound_at: now,
    telegram_message_thread_id: created.message_thread_id,
    topic_created_at: now,
    topic_delete_after: deleteAfter,
    topic_deleted_at: null,
    updated_at: now,
  }, { onConflict: "activity_id" });
  if (save.error) throw save.error;
  return {
    inviteUrl: binding.url,
    topicUrl: forumTopicUrl(chatId, created.message_thread_id),
    messageThreadId: created.message_thread_id,
    title: created.name || title,
    deleteAfter,
    reused: false,
  };
};
