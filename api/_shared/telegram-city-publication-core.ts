export type CityTelegramPublicationState = {
  activityId: string;
  active: boolean;
  chatId: number;
  messageId: number;
  pinnedAt: string;
  unpinAt: string;
  unpinnedAt?: string;
};

export type ActivityLifecycleInput = {
  id: string;
  event_date: string;
  event_time: string | null;
  activity_type: string | null;
  metadata: Record<string, unknown> | null;
};

const cityTelegramDestinations: Record<string, number> = {
  praha: -1003976986591,
  olomouc: -1004322361537,
};

export const resolveCityTelegramChatId = (cityId: string | null | undefined) =>
  cityId ? cityTelegramDestinations[cityId] ?? null : null;

const pragueFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const partsAt = (date: Date) => {
  const parts = pragueFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
};

export const pragueWallTimeToDate = (eventDate: string, eventTime: string | null | undefined) => {
  const dateMatch = eventDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = (eventTime || "00:00").match(/^(\d{2}):(\d{2})/);
  if (!dateMatch || !timeMatch) throw new Error("activity_time_invalid");

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
  let instant = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = partsAt(new Date(instant));
    const targetWall = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0);
    const actualWall = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);
    const adjustment = targetWall - actualWall;
    if (!adjustment) break;
    instant += adjustment;
  }

  const verified = partsAt(new Date(instant));
  if (Object.entries(target).some(([key, value]) => verified[key as keyof typeof verified] !== value)) {
    throw new Error("activity_time_invalid");
  }
  return new Date(instant);
};

const sportMetadata = (metadata: Record<string, unknown> | null) => {
  const sport = metadata?.sport;
  return sport && typeof sport === "object" ? sport as Record<string, unknown> : null;
};

export const activityDurationMinutes = (activity: ActivityLifecycleInput) => {
  const sport = sportMetadata(activity.metadata);
  const isSport = activity.activity_type === "sport" || Boolean(sport);
  if (!isSport) return 120;
  const duration = Number(sport?.durationMinutes);
  return Number.isFinite(duration) && duration > 0 ? duration : 90;
};

export const activityEndsAt = (activity: ActivityLifecycleInput) => {
  const start = pragueWallTimeToDate(activity.event_date, activity.event_time);
  return new Date(start.getTime() + activityDurationMinutes(activity) * 60_000);
};

export const activityDateLabel = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
};

export const readCityTelegramPublicationState = (metadata: Record<string, unknown> | null | undefined) => {
  const raw = metadata?.cityTelegramPublication;
  if (!raw || typeof raw !== "object") return null;
  const state = raw as Record<string, unknown>;
  if (typeof state.activityId !== "string"
    || typeof state.active !== "boolean"
    || !Number.isSafeInteger(state.chatId)
    || !Number.isSafeInteger(state.messageId)
    || typeof state.pinnedAt !== "string"
    || typeof state.unpinAt !== "string") return null;
  const parsed: CityTelegramPublicationState = {
    activityId: state.activityId,
    active: state.active,
    chatId: Number(state.chatId),
    messageId: Number(state.messageId),
    pinnedAt: state.pinnedAt,
    unpinAt: state.unpinAt,
  };
  if (typeof state.unpinnedAt === "string") parsed.unpinnedAt = state.unpinnedAt;
  return parsed;
};

export const withCityTelegramPublicationState = (
  metadata: Record<string, unknown> | null | undefined,
  state: CityTelegramPublicationState,
) => ({
  ...(metadata || {}),
  cityTelegramPublication: state,
});

export const buildCitySendPhotoPayload = (
  chatId: number,
  card: {
    photo_url: string;
    caption?: string;
    reply_markup?: unknown;
  },
) => ({
  chat_id: chatId,
  photo: card.photo_url,
  caption: card.caption || "",
  reply_markup: card.reply_markup,
});
