const beautySlugPattern = /^beauty-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export const parseBeautyStartParam = (value: string | null | undefined) => {
  const slug = String(value || "").trim().toLowerCase();
  return isValidBeautyPublicSlug(slug) ? slug : "";
};

export const buildBeautyPublicLink = (slug: string) => {
  const normalized = normalizeBeautyPublicSlug(slug);
  return isValidBeautyPublicSlug(normalized) ? `/beauty/${encodeURIComponent(normalized)}` : "/beauty";
};

export const buildTelegramBeautyInviteUrl = (
  slug: string,
  botUsername: string,
  appName = "",
) => {
  const normalized = normalizeBeautyPublicSlug(slug);
  const bot = botUsername.trim().replace(/^@/, "");
  if (!isValidBeautyPublicSlug(normalized) || !bot) return null;
  const appPath = appName.trim().replace(/^\/+|\/+$/g, "");
  return `https://t.me/${bot}${appPath ? `/${appPath}` : ""}?startapp=${normalized}`;
};
