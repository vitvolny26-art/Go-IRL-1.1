import { createHmac, timingSafeEqual } from "node:crypto";
import { getCity } from "../config/cities.js";
import { buildTelegramActivityInviteUrl } from "../invitationLink.js";

export type OlomoucCommunityActivity = {
  id: string;
  category_id: string;
  activity_ru: string;
  activity_cs: string;
  title_ru: string;
  title_cs: string;
  description_ru?: string | null;
  description_cs?: string | null;
  event_date: string;
  event_time: string;
  city_id: string;
  address: string;
  price: number;
  visibility: "public" | "private" | "invite";
  metadata: Record<string, unknown> | null;
};

export type TelegramCommunityPost = {
  chatId: number;
  topicId: number;
  messageId: number;
  postedAt: string;
  signature: string;
  removedAt?: string;
};

export type OlomoucCommunityRepository = {
  listActivities(): Promise<OlomoucCommunityActivity[]>;
  saveMetadata(activityId: string, metadata: Record<string, unknown>): Promise<void>;
};

export type OlomoucCommunityTelegram = {
  sendMessage(input: {
    chatId: number;
    topicId: number;
    text: string;
    eventUrl: string;
  }): Promise<number>;
  pinMessage(chatId: number, messageId: number): Promise<void>;
  unpinMessage(chatId: number, messageId: number): Promise<void>;
  deleteMessage(chatId: number, messageId: number): Promise<void>;
};

const olomouc = getCity("olomouc");
const community = (() => {
  const value = olomouc.telegramCommunity;
  if (!value?.topicIds) throw new Error("olomouc_telegram_community_missing");
  return { ...value, topicIds: value.topicIds };
})();

const communityKey = "telegramCommunity";
const defaultDurationMinutes = 120;

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const asPositiveInteger = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const postSignature = (
  activityId: string,
  post: Omit<TelegramCommunityPost, "signature" | "removedAt">,
  secret: string,
) => createHmac("sha256", secret)
  .update([activityId, post.chatId, post.topicId, post.messageId, post.postedAt].join(":"))
  .digest("hex");

const signaturesMatch = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
};

export const readTelegramCommunityPost = (
  activityId: string,
  metadata: Record<string, unknown> | null,
  secret: string,
) => {
  const value = asObject(metadata?.[communityKey]);
  const chatId = Number(value.chatId);
  const topicId = asPositiveInteger(value.topicId);
  const messageId = asPositiveInteger(value.messageId);
  const postedAt = typeof value.postedAt === "string" ? value.postedAt : "";
  const signature = typeof value.signature === "string" ? value.signature : "";
  if (chatId !== community.chatId || !topicId || !messageId || !postedAt || !signature) return null;
  if (!Object.values(community.topicIds).includes(topicId)) return null;
  const post = {
    chatId,
    topicId,
    messageId,
    postedAt,
    signature,
    ...(typeof value.removedAt === "string" && value.removedAt
      ? { removedAt: value.removedAt }
      : {}),
  } satisfies TelegramCommunityPost;
  const expected = postSignature(activityId, { chatId, topicId, messageId, postedAt }, secret);
  return signaturesMatch(signature, expected) ? post : null;
};

const activitySearchText = (activity: OlomoucCommunityActivity) => [
  activity.activity_ru,
  activity.activity_cs,
  activity.title_ru,
  activity.title_cs,
  activity.description_ru,
  activity.description_cs,
].filter(Boolean).join(" ").toLocaleLowerCase();

export const resolveOlomoucCommunityTopicId = (activity: OlomoucCommunityActivity) => {
  const text = activitySearchText(activity);
  if (/дет|ребен|dět|rodin|kids|child/.test(text)) return community.topicIds.kids;
  if (/язык|мовн|jazyk|language|network|коворкинг|cowork/.test(text)) return community.topicIds.education;
  if (/игр|шахмат|bowling|deskov|šach|game|quiz|квиз/.test(text)) return community.topicIds.games;
  if (/музык|концерт|караок|танц|festival|hudeb|koncert|karaoke|tanec|вечерин|večírek/.test(text)) {
    return community.topicIds.music;
  }
  if (activity.category_id === "sport") return community.topicIds.sport;
  if (activity.category_id === "nature" || /поход|прогул|пикник|kemp|výlet|procház|outdoor/.test(text)) {
    return community.topicIds.outdoor;
  }
  if (activity.category_id === "creativity" || /кино|театр|выстав|kultur|kino|divad|výstav/.test(text)) {
    return community.topicIds.culture;
  }
  return community.topicIds.chat;
};

const eventDurationMinutes = (activity: OlomoucCommunityActivity) => {
  const metadata = asObject(activity.metadata);
  const sport = asObject(metadata.sport);
  const duration = Number(sport.durationMinutes);
  return Number.isFinite(duration) ? Math.max(15, duration) : defaultDurationMinutes;
};

const timeZoneOffsetMs = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  ) - date.getTime();
};

const pragueDateTimeToUtc = (date: string, time: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute || 0));
  const firstOffset = timeZoneOffsetMs(utcGuess, "Europe/Prague");
  const firstUtc = new Date(utcGuess.getTime() - firstOffset);
  const secondOffset = timeZoneOffsetMs(firstUtc, "Europe/Prague");
  return new Date(utcGuess.getTime() - secondOffset);
};

export const olomoucActivityEndsAt = (activity: OlomoucCommunityActivity) => {
  const start = pragueDateTimeToUtc(
    activity.event_date,
    String(activity.event_time || "23:59").slice(0, 5),
  );
  if (!start || Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + eventDurationMinutes(activity) * 60_000);
};

const displayDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
};

const displayTime = (value: string) => String(value || "").slice(0, 5);

export const buildOlomoucCommunityMessage = (
  activity: OlomoucCommunityActivity,
  eventUrl: string,
) => {
  const dateTime = `${displayDate(activity.event_date)} · ${displayTime(activity.event_time)}`;
  const priceCs = activity.price > 0 ? `${activity.price} Kč` : "Zdarma";
  const priceRu = activity.price > 0 ? `${activity.price} Kč` : "Бесплатно";
  return [
    "🇨🇿 Nová aktivita v Olomouci",
    activity.title_cs || activity.activity_cs,
    `📅 ${dateTime}`,
    `📍 ${activity.address}`,
    `💰 ${priceCs}`,
    `Otevřít událost: ${eventUrl}`,
    "",
    "🇷🇺 Новая активность в Оломоуце",
    activity.title_ru || activity.activity_ru,
    `📅 ${dateTime}`,
    `📍 ${activity.address}`,
    `💰 ${priceRu}`,
    `Открыть событие: ${eventUrl}`,
  ].join("\n");
};

export class TelegramCommunityBot implements OlomoucCommunityTelegram {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(method: string, body: Record<string, unknown>, allowMissing = false): Promise<T> {
    const response = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as {
      ok?: boolean;
      result?: T;
      description?: string;
    };
    const description = String(payload.description || "");
    if (response.ok && payload.ok) return payload.result as T;
    if (allowMissing && response.status === 400 && /message to (unpin|delete) not found|message_id_invalid/i.test(description)) {
      return undefined as T;
    }
    throw new Error(`telegram_${method}_failed:${description || response.status}`);
  }

  async sendMessage(input: { chatId: number; topicId: number; text: string; eventUrl: string }) {
    const result = await this.call<{ message_id: number }>("sendMessage", {
      chat_id: input.chatId,
      message_thread_id: input.topicId,
      text: input.text,
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [[{
          text: "Otevřít / Открыть",
          url: input.eventUrl,
        }]],
      },
    });
    if (!asPositiveInteger(result?.message_id)) throw new Error("telegram_sendMessage_missing_message_id");
    return result.message_id;
  }

  async pinMessage(chatId: number, messageId: number) {
    await this.call("pinChatMessage", {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: true,
    });
  }

  async unpinMessage(chatId: number, messageId: number) {
    await this.call("unpinChatMessage", { chat_id: chatId, message_id: messageId }, true);
  }

  async deleteMessage(chatId: number, messageId: number) {
    await this.call("deleteMessage", { chat_id: chatId, message_id: messageId }, true);
  }
}

export type OlomoucCommunitySyncOptions = {
  now?: Date;
  botUsername?: string;
  appName?: string;
  stateSecret: string;
};

export async function syncOlomoucCommunityActivities(
  repository: OlomoucCommunityRepository,
  telegram: OlomoucCommunityTelegram,
  options: OlomoucCommunitySyncOptions,
) {
  const now = options.now || new Date();
  const activities = await repository.listActivities();
  const summary = { scanned: activities.length, posted: 0, removed: 0, skipped: 0 };

  for (const activity of activities) {
    const post = readTelegramCommunityPost(activity.id, activity.metadata, options.stateSecret);
    const endsAt = olomoucActivityEndsAt(activity);
    if (!endsAt) {
      summary.skipped += 1;
      continue;
    }

    if (post && !post.removedAt && (
      endsAt.getTime() <= now.getTime()
      || activity.city_id !== "olomouc"
      || activity.visibility !== "public"
    )) {
      await telegram.unpinMessage(post.chatId, post.messageId);
      await telegram.deleteMessage(post.chatId, post.messageId);
      await repository.saveMetadata(activity.id, {
        ...asObject(activity.metadata),
        [communityKey]: { ...post, removedAt: now.toISOString() },
      });
      summary.removed += 1;
      continue;
    }

    if (
      post
      || endsAt.getTime() <= now.getTime()
      || activity.city_id !== "olomouc"
      || activity.visibility !== "public"
    ) {
      summary.skipped += 1;
      continue;
    }

    const eventUrl = buildTelegramActivityInviteUrl(
      activity.id,
      options.botUsername || "GOirl_bot",
      options.appName || "",
    );
    if (!eventUrl) {
      summary.skipped += 1;
      continue;
    }

    const topicId = resolveOlomoucCommunityTopicId(activity);
    const messageId = await telegram.sendMessage({
      chatId: community.chatId,
      topicId,
      text: buildOlomoucCommunityMessage(activity, eventUrl),
      eventUrl,
    });
    try {
      await telegram.pinMessage(community.chatId, messageId);
      const postedAt = now.toISOString();
      const unsignedPost = {
        chatId: community.chatId,
        topicId,
        messageId,
        postedAt,
      };
      await repository.saveMetadata(activity.id, {
        ...asObject(activity.metadata),
        [communityKey]: {
          ...unsignedPost,
          signature: postSignature(activity.id, unsignedPost, options.stateSecret),
        } satisfies TelegramCommunityPost,
      });
      summary.posted += 1;
    } catch (error) {
      await telegram.unpinMessage(community.chatId, messageId).catch(() => undefined);
      await telegram.deleteMessage(community.chatId, messageId).catch(() => undefined);
      throw error;
    }
  }

  return summary;
}

export const olomoucTelegramCommunityUrl = community.url;
