import { getTelegramWebApp } from "./telegram";

export type ExternalTelegramChatKind = "event" | "team";
export type ExternalTelegramChatLifecycle = "active" | "locked" | "deletion_due" | "archived";
export type ExternalTelegramChatVerificationState = "manual" | "verified";

export type ExternalTelegramChatLink = {
  kind: ExternalTelegramChatKind;
  url: string;
  attachedByUserKey: string;
  attachedAt: string;
  keepArchive?: boolean;
  verificationState: ExternalTelegramChatVerificationState;
  boundAt?: string;
  telegramChatTitle?: string;
  telegramChatId?: number;
  telegramMessageThreadId?: number;
  topicUrl?: string;
  topicDeleteAfter?: string;
  topicDeletedAt?: string;
};

type ChatAccessInput = {
  currentUserKey: string | null | undefined;
  organizerUserKey: string;
  membershipStatus?: "joined" | "waiting" | "pending" | null;
};

type LifecycleInput = {
  kind: ExternalTelegramChatKind;
  eventEndsAt?: string | null;
  keepArchive?: boolean;
  now?: Date;
};

const allowedHosts = new Set(["t.me", "telegram.me", "www.t.me", "www.telegram.me"]);
const validPath = /^\/(?:joinchat\/[-_A-Za-z0-9]+|\+[-_A-Za-z0-9]+|c\/\d+\/\d+|[A-Za-z0-9_]{5,})(?:\/\d+)?\/?$/;
const eventStoragePrefix = "go-irl:external-telegram-chat:event:";
const telegramGroupCreationLink = "https://t.me/GOirl_bot?startgroup=go_irl_event";

export const normalizeExternalTelegramChatUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname.toLowerCase())) return null;
    if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return null;
    if (!validPath.test(parsed.pathname)) return null;

    const path = parsed.pathname.replace(/\/$/, "");
    return `https://t.me${path}`;
  } catch {
    return null;
  }
};

export const buildTelegramForumTopicUrl = (
  telegramChatId: number | null | undefined,
  messageThreadId: number | null | undefined,
) => {
  if (!Number.isSafeInteger(telegramChatId) || !Number.isSafeInteger(messageThreadId) || Number(messageThreadId) <= 0) return null;
  const chatId = String(Math.trunc(Number(telegramChatId)));
  if (!chatId.startsWith("-100") || chatId.length <= 4) return null;
  return `https://t.me/c/${chatId.slice(4)}/${Math.trunc(Number(messageThreadId))}`;
};

export const isValidExternalTelegramChatUrl = (value: string) =>
  normalizeExternalTelegramChatUrl(value) !== null;

export const canAccessExternalTelegramChat = ({
  currentUserKey,
  organizerUserKey,
  membershipStatus,
}: ChatAccessInput) => Boolean(
  currentUserKey
  && (currentUserKey === organizerUserKey || membershipStatus === "joined")
);

export const resolveExternalTelegramChatLifecycle = ({
  kind,
  eventEndsAt,
  keepArchive = false,
  now = new Date(),
}: LifecycleInput): ExternalTelegramChatLifecycle => {
  if (kind === "team") return "active";
  if (!eventEndsAt) return "active";

  const eventEnd = new Date(eventEndsAt).getTime();
  if (!Number.isFinite(eventEnd)) return "active";

  const elapsed = now.getTime() - eventEnd;
  if (elapsed < 24 * 60 * 60 * 1000) return "active";
  if (keepArchive) return "archived";
  return "deletion_due";
};

const eventStorageKey = (activityId: string) => `${eventStoragePrefix}${activityId}`;

export const loadLocalEventTelegramChatLink = (activityId: string): ExternalTelegramChatLink | null => {
  if (!activityId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(eventStorageKey(activityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExternalTelegramChatLink>;
    const url = normalizeExternalTelegramChatUrl(String(parsed.url || ""));
    if (!url || parsed.kind !== "event" || !parsed.attachedByUserKey || !parsed.attachedAt) return null;
    const telegramChatId = Number.isSafeInteger(parsed.telegramChatId) ? Number(parsed.telegramChatId) : undefined;
    const telegramMessageThreadId = Number.isSafeInteger(parsed.telegramMessageThreadId)
      ? Number(parsed.telegramMessageThreadId)
      : undefined;
    return {
      kind: "event",
      url,
      attachedByUserKey: String(parsed.attachedByUserKey),
      attachedAt: String(parsed.attachedAt),
      keepArchive: Boolean(parsed.keepArchive),
      verificationState: parsed.verificationState === "verified" ? "verified" : "manual",
      boundAt: parsed.boundAt ? String(parsed.boundAt) : undefined,
      telegramChatTitle: parsed.telegramChatTitle ? String(parsed.telegramChatTitle) : undefined,
      telegramChatId,
      telegramMessageThreadId,
      topicUrl: buildTelegramForumTopicUrl(telegramChatId, telegramMessageThreadId) || undefined,
      topicDeleteAfter: parsed.topicDeleteAfter ? String(parsed.topicDeleteAfter) : undefined,
      topicDeletedAt: parsed.topicDeletedAt ? String(parsed.topicDeletedAt) : undefined,
    };
  } catch {
    return null;
  }
};

export const saveLocalEventTelegramChatLink = (
  activityId: string,
  value: string,
  attachedByUserKey: string,
) => {
  const url = normalizeExternalTelegramChatUrl(value);
  if (!activityId || !url || !attachedByUserKey || typeof window === "undefined") return null;
  const link: ExternalTelegramChatLink = {
    kind: "event",
    url,
    attachedByUserKey,
    attachedAt: new Date().toISOString(),
    verificationState: "manual",
  };
  window.localStorage.setItem(eventStorageKey(activityId), JSON.stringify(link));
  return link;
};

export const removeLocalEventTelegramChatLink = (activityId: string) => {
  if (!activityId || typeof window === "undefined") return;
  window.localStorage.removeItem(eventStorageKey(activityId));
};

type OpenDependencies = {
  openTelegramLink?: (url: string) => void;
  openBrowser?: (url: string) => void;
};

export const openTelegramGroupCreation = (
  dependencies: OpenDependencies = {},
) => {
  const telegramOpen = dependencies.openTelegramLink || getTelegramWebApp()?.openTelegramLink;
  if (telegramOpen) {
    telegramOpen(telegramGroupCreationLink);
    return true;
  }

  if (!dependencies.openBrowser && typeof window === "undefined") return false;
  const browserOpen = dependencies.openBrowser || ((target: string) => {
    window.open(target, "_blank", "noopener,noreferrer");
  });
  browserOpen(telegramGroupCreationLink);
  return true;
};

export const openExternalTelegramChat = (
  value: string,
  dependencies: OpenDependencies = {},
) => {
  const url = normalizeExternalTelegramChatUrl(value);
  if (!url) return false;

  const telegramOpen = dependencies.openTelegramLink || getTelegramWebApp()?.openTelegramLink;
  if (telegramOpen) {
    telegramOpen(url);
    return true;
  }

  const browserOpen = dependencies.openBrowser || ((target: string) => {
    window.open(target, "_blank", "noopener,noreferrer");
  });
  browserOpen(url);
  return true;
};