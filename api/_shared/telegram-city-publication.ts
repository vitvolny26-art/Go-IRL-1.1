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
  await telegramApi("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption: card.caption || "",
    reply_markup: card.reply_markup,
  });
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
  const publishingTelegramApi: TelegramApi = async <T>(method: string, body: Record<string, unknown> = {}) => {
    if (method === "pinChatMessage" || method === "unpinChatMessage") return true as T;
    if (method === "sendPhoto") {
      const chatId = Number(body.chat_id);
      if (!Number.isSafeInteger(chatId)) throw new Error("telegram_city_chat_invalid");
    }
    return telegramApi<T>(method, body);
  };

  const baseResult = await publishCanonicalCityActivityBase({
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
};