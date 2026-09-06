import { ensureActivitySharePublicAlias, persistActivityShareCard } from "./activity-share-card-storage.js";
import { buildTelegramEventCard } from "./telegram-event-card.js";
import { createTelegramShareCardToken } from "./telegram-share-card-token.js";
import { loadTrustedTelegramEventCard, type ShareLanguage } from "./telegram-share-event.js";
import {
  publishCanonicalCityActivity as publishCanonicalCityActivityBase,
  createCanonicalCityTopic,
  syncJoinedParticipantTelegramAccess,
  unpinCanonicalCityActivity,
  unpinDueCanonicalCityActivities,
  type CityActivityRow,
  type TelegramApi,
} from "./telegram-city-publication-base.js";

export type { CityActivityRow, TelegramApi };
export { createCanonicalCityTopic, syncJoinedParticipantTelegramAccess, unpinCanonicalCityActivity, unpinDueCanonicalCityActivities };

const telegramMediaOrigin = "https://go-irl-1-1.vercel.app";
const shareLanguages: readonly ShareLanguage[] = ["ru", "uk", "cs", "en", "pl", "sk"];

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
  return buildTelegramEventCard(card, image.toString());
};

const telegramErrorMessage = (error: unknown) => error instanceof Error ? error.message.toLowerCase() : "";

const isTopicStateNoop = (error: unknown) => {
  const message = telegramErrorMessage(error);
  return message.includes("topic not modified")
    || message.includes("topic is not modified")
    || message.includes("message thread not found");
};

const isTopicClosed = (error: unknown) => telegramErrorMessage(error).includes("topic_closed")
  || telegramErrorMessage(error).includes("topic is closed");

const reopenGeneralTopic = async (telegramApi: TelegramApi, chatId: number) => {
  try {
    await telegramApi<boolean>("reopenGeneralForumTopic", { chat_id: chatId });
  } catch (error) {
    if (!isTopicStateNoop(error)) throw error;
  }
};

const closeGeneralTopic = async (telegramApi: TelegramApi, chatId: number) => {
  try {
    await telegramApi<boolean>("closeGeneralForumTopic", { chat_id: chatId });
  } catch (error) {
    if (!isTopicStateNoop(error)) throw error;
  }
};

const editTrackedCard = async ({
  telegramApi,
  chatId,
  messageId,
  card,
}: {
  telegramApi: TelegramApi;
  chatId: number;
  messageId: number;
  card: Awaited<ReturnType<typeof buildCanonicalShare>>;
}) => {
  const edit = () => telegramApi("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption: card.caption || "",
    reply_markup: card.reply_markup,
  });

  try {
    await edit();
  } catch (error) {
    if (!isTopicClosed(error)) throw error;
    await reopenGeneralTopic(telegramApi, chatId);
    try {
      await edit();
    } finally {
      await closeGeneralTopic(telegramApi, chatId);
    }
  }
};

export const publishCanonicalCityActivity = async ({
  supabase,
  telegramApi,
  botToken,
  activityId,
  language = "cs",
  organizerKey,
}: {
  supabase: Parameters<typeof publishCanonicalCityActivityBase>[0]["supabase"];
  telegramApi: TelegramApi;
  botToken: string;
  activityId: string;
  language?: ShareLanguage;
  organizerKey?: string;
}) => {
  let publicationChatId: number | null = null;
  let topicOpenedForPublish = false;

  const publishingTelegramApi: TelegramApi = async <T>(method: string, body: Record<string, unknown> = {}) => {
    if (method === "pinChatMessage" || method === "unpinChatMessage") return true as T;
    if (method === "sendPhoto") {
      const chatId = Number(body.chat_id);
      if (!Number.isSafeInteger(chatId)) throw new Error("telegram_city_chat_invalid");
      publicationChatId = chatId;
      await reopenGeneralTopic(telegramApi, chatId);
      topicOpenedForPublish = true;
    }
    return telegramApi<T>(method, body);
  };

  let baseResult: Awaited<ReturnType<typeof publishCanonicalCityActivityBase>> | undefined;
  try {
    baseResult = await publishCanonicalCityActivityBase({
      supabase,
      telegramApi: publishingTelegramApi,
      botToken,
      activityId,
      language,
      organizerKey,
    });

    if (baseResult.published && baseResult.reused) {
      const card = await buildCanonicalShare(activityId, language, botToken);
      await editTrackedCard({
        telegramApi,
        chatId: baseResult.chatId,
        messageId: baseResult.messageId,
        card,
      });
    }

    return baseResult.published && baseResult.reused
      ? { ...baseResult, updated: true, mediaUnchanged: true, pinned: false } as const
      : baseResult.published
        ? { ...baseResult, mediaUnchanged: true, pinned: false } as const
        : baseResult;
  } finally {
    if (topicOpenedForPublish && publicationChatId !== null) {
      await closeGeneralTopic(telegramApi, publicationChatId);
    } else if (baseResult?.published) {
      await closeGeneralTopic(telegramApi, baseResult.chatId);
    }
  }
};
