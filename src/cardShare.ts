import { buildSocialAttributionUrl, type SocialAttribution } from "./socialAttribution";

export type CardShareChannel = "telegram" | "whatsapp" | "messenger" | "facebook" | "instagram";
export type CardShareAttributionChannel = CardShareChannel | "native" | "copy";

export type CardShareContent = {
  title: string;
  date: string;
  address: string;
  url: string;
  language?: "ru" | "uk" | "cs" | "en";
};

export type CardShareAttributionContext = Pick<SocialAttribution, "campaign" | "ref">;

const eventIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const beautySlugPattern = /^beauty-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const shareApiOrigin = "https://go-irl-1-1.vercel.app";
const publicAppOrigin = "https://go-irl.fun";
const shareTextMarker = "GO IRL:";
export const metaAppId = "1332867179009910";

const cyrillicAliasMap: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", ё: "e", є: "ie", ж: "zh", з: "z", и: "i", і: "i", ї: "i",
  й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

const shortAliasPart = (value: string) => value
  .normalize("NFKD")
  .toLowerCase()
  .split("")
  .map((character) => cyrillicAliasMap[character] ?? character)
  .join("")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 18) || "activity";

export const buildActivitySharePublicAlias = (title: string, eventId: string) =>
  `${shortAliasPart(title)}_${eventId.slice(0, 8).toLowerCase()}`;

export const normalizeCardShareUrl = (value: string) => {
  const trimmed = value.trim();
  const markerIndex = trimmed.indexOf(shareTextMarker);
  const candidate = (markerIndex > 0 ? trimmed.slice(0, markerIndex) : trimmed).trim();

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : candidate;
  } catch {
    return candidate;
  }
};

export const buildCardShareText = ({ title, date, address, url }: CardShareContent) =>
  [[`GO IRL: ${title}`, date, address].filter(Boolean).join("\n"), url].filter(Boolean).join("\n\n");

const beautyShareSlugFromUrl = (value: string) => {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/beauty\/([^/]+)\/?$/i);
    const slug = match?.[1] ? decodeURIComponent(match[1]).trim().toLowerCase() : "";
    return beautySlugPattern.test(slug) ? slug : "";
  } catch {
    return "";
  }
};

export const isBeautyCardShareContent = (content: CardShareContent) =>
  Boolean(beautyShareSlugFromUrl(content.url));

export const buildMetaEventPreviewUrl = (content: CardShareContent) => {
  try {
    const inviteUrl = new URL(content.url);
    const beautySlug = beautyShareSlugFromUrl(inviteUrl.toString());
    if (beautySlug) {
      const previewUrl = new URL("/api/meta/event-preview", shareApiOrigin);
      previewUrl.searchParams.set("slug", beautySlug);
      previewUrl.searchParams.set("language", content.language || "ru");
      if (content.date.trim()) previewUrl.searchParams.set("date", content.date.trim());
      previewUrl.searchParams.set("v", "12");
      return previewUrl.toString();
    }

    const eventId = inviteUrl.searchParams.get("startapp")?.trim() || "";
    if (!eventIdPattern.test(eventId)) return content.url;

    const previewUrl = new URL("/api/meta/event-preview", shareApiOrigin);
    previewUrl.searchParams.set("event", eventId);
    previewUrl.searchParams.set("language", content.language || "ru");
    return previewUrl.toString();
  } catch {
    return content.url;
  }
};

export const buildCardShareLandingUrl = (content: CardShareContent) => {
  try {
    const previewUrl = new URL(buildMetaEventPreviewUrl(content));
    const language = content.language || "ru";
    const eventId = previewUrl.searchParams.get("event") || "";
    if (eventIdPattern.test(eventId)) {
      const landingUrl = new URL(`/${buildActivitySharePublicAlias(content.title, eventId)}`, publicAppOrigin);
      if (language !== "ru") landingUrl.searchParams.set("language", language);
      return landingUrl.toString();
    }

    const beautySlug = previewUrl.searchParams.get("slug") || "";
    if (beautySlugPattern.test(beautySlug)) {
      const landingUrl = new URL(`/s/${encodeURIComponent(beautySlug)}`, publicAppOrigin);
      if (language !== "ru") landingUrl.searchParams.set("language", language);
      const date = previewUrl.searchParams.get("date") || "";
      if (date) landingUrl.searchParams.set("date", date);
      return landingUrl.toString();
    }
  } catch {
    // Fall through to the original public URL.
  }
  return normalizeCardShareUrl(content.url);
};

const cardShareAttribution = {
  telegram: { source: "telegram", medium: "message" },
  whatsapp: { source: "whatsapp", medium: "message" },
  messenger: { source: "messenger", medium: "message" },
  facebook: { source: "facebook", medium: "share" },
  instagram: { source: "instagram", medium: "share" },
  native: { source: "native", medium: "share" },
  copy: { source: "copy", medium: "copy" },
} as const satisfies Record<CardShareAttributionChannel, Pick<SocialAttribution, "source" | "medium">>;

export const buildCardShareSmartUrl = (
  content: CardShareContent,
  channel: CardShareAttributionChannel,
  context: CardShareAttributionContext = {},
) => {
  const landingUrl = buildCardShareLandingUrl(content);
  if (isBeautyCardShareContent(content)) return landingUrl;
  return buildSocialAttributionUrl(landingUrl, {
    ...context,
    ...cardShareAttribution[channel],
  });
};

export const buildMessengerPreviewUrl = buildMetaEventPreviewUrl;

export const buildCardShareImageUrl = (content: CardShareContent) => {
  const url = new URL(buildMetaEventPreviewUrl(content));
  if (url.pathname !== "/api/meta/event-preview") return "";
  url.searchParams.set("format", "image");
  return url.toString();
};

export const buildCardShareDownloadUrl = (content: CardShareContent) => {
  const imageUrl = buildCardShareImageUrl(content);
  if (!imageUrl) return "";
  const origin = typeof window === "undefined" ? shareApiOrigin : window.location.origin;
  const downloadUrl = new URL(imageUrl, origin);
  downloadUrl.searchParams.set("format", "download");
  return downloadUrl.toString();
};

export const buildOrganicCardShareContent = (content: CardShareContent) => ({
  title: `GO IRL: ${content.title}`,
  text: [content.date, content.address].filter(Boolean).join("\n"),
  url: buildMetaEventPreviewUrl(content),
});

export const buildAttributedOrganicCardShareContent = (
  content: CardShareContent,
  channel: Extract<CardShareAttributionChannel, "messenger" | "instagram" | "native" | "copy">,
  context: CardShareAttributionContext = {},
) => ({
  ...buildOrganicCardShareContent(content),
  url: buildCardShareSmartUrl(content, channel, context),
});

export const buildFacebookShareTarget = (content: CardShareContent) => {
  const target = new URL("https://www.facebook.com/sharer/sharer.php");
  const smartUrl = buildCardShareSmartUrl(content, "facebook");
  target.searchParams.set("u", smartUrl);
  target.searchParams.set("quote", buildCardShareText({ ...content, url: smartUrl }));
  return target.toString();
};

export const buildMessengerSendTarget = (content: CardShareContent) => {
  const dialogUrl = new URL("https://www.facebook.com/dialog/send");
  dialogUrl.searchParams.set("app_id", metaAppId);
  dialogUrl.searchParams.set("link", buildCardShareSmartUrl(content, "messenger"));
  dialogUrl.searchParams.set("redirect_uri", publicAppOrigin);
  return dialogUrl.toString();
};

export const buildMessengerAppTarget = (content: CardShareContent) => {
  const link = encodeURIComponent(buildCardShareSmartUrl(content, "messenger"));
  return `fb-messenger://share/?link=${link}&app_id=${encodeURIComponent(metaAppId)}`;
};

export const buildMessengerAndroidIntentTarget = (content: CardShareContent) => {
  const link = encodeURIComponent(buildCardShareSmartUrl(content, "messenger"));
  return `intent://share/?link=${link}&app_id=${encodeURIComponent(metaAppId)}#Intent;scheme=fb-messenger;package=com.facebook.orca;end`;
};

export const buildMessengerShareBridgeTarget = (content: CardShareContent, origin = publicAppOrigin) => {
  const target = new URL("/messenger-share.html", origin);
  target.searchParams.set("title", content.title);
  target.searchParams.set("date", content.date);
  target.searchParams.set("address", content.address);
  target.searchParams.set("url", buildCardShareSmartUrl(content, "messenger"));
  return target.toString();
};

export const buildCardShareTarget = (channel: Exclude<CardShareChannel, "instagram">, content: CardShareContent) => {
  const normalizedContent = { ...content, url: normalizeCardShareUrl(content.url) };
  if (channel === "telegram") {
    const target = new URL("https://t.me/share/url");
    target.searchParams.set("url", isBeautyCardShareContent(normalizedContent) ? normalizedContent.url : buildCardShareLandingUrl(normalizedContent));
    target.searchParams.set("text", buildCardShareText({ ...normalizedContent, url: "" }));
    return target.toString();
  }
  if (channel === "whatsapp") {
    if (isBeautyCardShareContent(normalizedContent)) {
      return `https://wa.me/?text=${encodeURIComponent(buildMetaEventPreviewUrl(normalizedContent))}`;
    }
    const landingUrl = buildCardShareSmartUrl(normalizedContent, "whatsapp");
    const message = buildCardShareText({ ...normalizedContent, url: landingUrl });
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
  if (channel === "facebook") return buildFacebookShareTarget(normalizedContent);
  return buildMessengerSendTarget(normalizedContent);
};
