const beautySlugPattern = /^beauty-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const telegramBeautyMessageStartParamSuffix = "__tgmsg";

export type BeautyStartAttribution = {
  source?: "telegram";
  medium?: "message";
};

export const normalizeBeautyPublicSlug = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^beauty-+/, "")
    .slice(0, 41);
  return normalized ? `beauty-${normalized}` : "";
};

export const isValidBeautyPublicSlug = (value: string) =>
  value.length >= 10 && value.length <= 48 && beautySlugPattern.test(value);

export const beautySlugFromPublicLink = (value: string) => {
  try {
    const pathname = new URL(value, "https://goirl.local").pathname;
    const match = pathname.match(/^\/beauty\/([^/?#]+)\/?$/);
    const slug = String(match?.[1] ? decodeURIComponent(match[1]) : "").trim().toLowerCase();
    return isValidBeautyPublicSlug(slug) ? slug : "";
  } catch {
    return "";
  }
};

const normalizedBeautyStartParam = (value: string | null | undefined) =>
  String(value || "").trim().toLowerCase();

export const parseBeautyStartParam = (value: string | null | undefined) => {
  const startParam = normalizedBeautyStartParam(value);
  const slug = startParam.endsWith(telegramBeautyMessageStartParamSuffix)
    ? startParam.slice(0, -telegramBeautyMessageStartParamSuffix.length)
    : startParam;
  return isValidBeautyPublicSlug(slug) ? slug : "";
};

export const parseBeautyStartAttribution = (
  value: string | null | undefined,
): BeautyStartAttribution => {
  const startParam = normalizedBeautyStartParam(value);
  if (!startParam.endsWith(telegramBeautyMessageStartParamSuffix)) return {};
  const slug = startParam.slice(0, -telegramBeautyMessageStartParamSuffix.length);
  return isValidBeautyPublicSlug(slug)
    ? { source: "telegram", medium: "message" }
    : {};
};

export const buildBeautyPublicLink = (slug: string) => {
  const normalized = normalizeBeautyPublicSlug(slug);
  return isValidBeautyPublicSlug(normalized) ? `/beauty/${encodeURIComponent(normalized)}` : "/beauty";
};

const buildTelegramBeautyUrl = (
  startParam: string,
  botUsername: string,
  appName = "",
) => {
  const bot = botUsername.trim().replace(/^@/, "");
  if (!startParam || !bot) return null;
  const appPath = appName.trim().replace(/^\/+|\/+$/g, "");
  return `https://t.me/${bot}${appPath ? `/${appPath}` : ""}?startapp=${encodeURIComponent(startParam)}`;
};

export const buildTelegramBeautyShareStartParam = (slug: string) => {
  const normalized = normalizeBeautyPublicSlug(slug);
  return isValidBeautyPublicSlug(normalized)
    ? `${normalized}${telegramBeautyMessageStartParamSuffix}`
    : "";
};

export const buildTelegramBeautyInviteUrl = (
  slug: string,
  botUsername: string,
  appName = "",
) => {
  const normalized = normalizeBeautyPublicSlug(slug);
  return isValidBeautyPublicSlug(normalized)
    ? buildTelegramBeautyUrl(normalized, botUsername, appName)
    : null;
};

export const buildTelegramBeautyShareInviteUrl = (
  slug: string,
  botUsername: string,
  appName = "",
) => buildTelegramBeautyUrl(
  buildTelegramBeautyShareStartParam(slug),
  botUsername,
  appName,
);
