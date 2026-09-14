import { parseBeautyStartParam } from "./beauty/beautyPublicSlug.js";

const eventUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const demoEventIdPattern = /^demo-[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export const isValidInvitationEventId = (value: string) => eventUuidPattern.test(value.trim());

export const parseInvitationStartParam = (value: string | null | undefined) => {
  const eventId = String(value || "").trim();
  if (isValidInvitationEventId(eventId)) return { valid: true as const, eventId };
  const beautySlug = parseBeautyStartParam(eventId);
  return beautySlug
    ? { valid: true as const, eventId: "", beautySlug }
    : { valid: false as const, eventId: "" };
};

export const activityIdFromJoinPath = (pathname: string) => {
  const match = pathname.match(/^\/join\/([^/?#]+)/);
  if (!match) return "";
  const eventId = decodeURIComponent(match[1]).trim();
  return isValidInvitationEventId(eventId) || demoEventIdPattern.test(eventId)
    ? eventId
    : "";
};

export const buildTelegramActivityInviteUrl = (
  eventId: string,
  botUsername: string,
  appName = "",
) => {
  const parsed = parseInvitationStartParam(eventId);
  if (!parsed.valid || !parsed.eventId) return null;
  const bot = botUsername.trim().replace(/^@/, "");
  if (!bot) return null;
  const appPath = appName.trim().replace(/^\/+|\/+$/g, "");
  const path = appPath ? `/${appPath}` : "";
  return `https://t.me/${bot}${path}?startapp=${parsed.eventId}`;
};

export const buildBrowserActivityInviteUrl = (eventId: string, origin: string) =>
  new URL(`/join/${encodeURIComponent(eventId.trim())}`, origin).toString();

export const buildMetaEventPreviewUrl = (
  eventId: string,
  origin: string,
  language: string,
) => {
  if (!isValidInvitationEventId(eventId)) return null;
  const url = new URL("/api/meta/event-preview", origin);
  url.searchParams.set("event", eventId.trim());
  url.searchParams.set("language", ["ru", "uk", "cs", "en", "pl", "sk"].includes(language) ? language : "ru");
  return url.toString();
};

export const buildSeparatedInvitationText = (url: string, text: string) =>
  [text.trim(), url.trim()].filter(Boolean).join("\n\n");

export const buildTelegramShareUrl = (url: string, text: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text.trim())}`;
