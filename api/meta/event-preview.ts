import { readEnv } from "../_shared/env.js";
import {
  ensureActivitySharePublicAlias,
  resolveActivitySharePublicAlias,
} from "../_shared/activity-share-card-storage.js";
import {
  buildActivityAttributionSession,
  socialAttributionParamKeys,
  socialAttributionSessionKey,
} from "../../src/socialAttribution.js";
import { buildMetaEventCalendar } from "../_shared/meta-event-calendar.js";
import {
  isBeautyShareSlug,
  loadTrustedTelegramBeautyCard,
} from "../_shared/telegram-share-beauty.js";
import {
  isIndexableEventVisibility,
  loadTrustedTelegramEventCard,
  isShareEventId,
  isShareLanguage,
} from "../_shared/telegram-share-event.js";
import { renderBeautyShareCardJpeg, renderTelegramBeautyShareCardJpeg, renderTelegramShareCardJpeg } from "../_shared/telegram-share-card-image.js";

type VercelRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  end(body?: string | Uint8Array): void;
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
};

const publicAppFallbackOrigin = "https://go-irl.fun";

const publicAppOrigin = () => (readEnv("GO_IRL_PUBLIC_ORIGIN")
  || readEnv("VITE_GO_IRL_PUBLIC_ORIGIN")
  || publicAppFallbackOrigin).replace(/\/+$/, "");

export const metaEventPreviewCopy = {
  ru: { open: "Открыть GO IRL", telegram: "Открыть в Telegram" },
  uk: { open: "Відкрити GO IRL", telegram: "Відкрити в Telegram" },
  cs: { open: "Otevřít GO IRL", telegram: "Otevřít v Telegramu" },
  en: { open: "Open GO IRL", telegram: "Open in Telegram" },
} as const;

const metaBeautyPreviewCopy = metaEventPreviewCopy;

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const activityAttributionProbe = "activity-attribution-v1";

export const buildEventAttributionCapture = (
  eventId: string,
  query: VercelRequest["query"],
) => {
  const params = new URLSearchParams();
  for (const key of socialAttributionParamKeys) {
    const value = first(query?.[key]);
    if (value) params.set(key, value);
  }

  const session = buildActivityAttributionSession({
    activityId: eventId,
    entryPath: `/e/${eventId}`,
    search: params,
  });
  const storageKey = JSON.stringify(socialAttributionSessionKey);
  if (!session) {
    return {
      attributed: false,
      script: `<script>try{sessionStorage.removeItem(${storageKey})}catch{}</script>`,
    };
  }

  return {
    attributed: true,
    script: `<script>try{sessionStorage.setItem(${storageKey},${JSON.stringify(JSON.stringify(session))})}catch{}</script>`,
  };
};

const eventLandingUrl = (origin: string, eventId: string, language: string) =>
  new URL(`/join/${encodeURIComponent(eventId)}/${language}`, origin).toString();

const canonicalEventUrl = (origin: string, eventId: string) =>
  new URL(`/e/${encodeURIComponent(eventId)}`, origin).toString();

type EventSeoCard = Pick<
  NonNullable<Awaited<ReturnType<typeof loadTrustedTelegramEventCard>>>,
  "visibility" | "title" | "activity" | "eventDate" | "time" | "address" | "city" | "organizer" | "price"
>;

const serializeJsonLd = (value: unknown) => JSON.stringify(value)
  .replaceAll("<", "\\u003c")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");

export const buildEventJsonLd = (card: EventSeoCard, canonicalUrl: string, imageUrl: string) => {
  if (!isIndexableEventVisibility(card.visibility)) return null;

  const title = card.title || card.activity || "GO IRL";
  const event: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: title,
    startDate: `${card.eventDate}T${card.time}:00`,
    url: canonicalUrl,
    image: [imageUrl],
    location: {
      "@type": "Place",
      name: card.address || card.city,
      address: {
        "@type": "PostalAddress",
        streetAddress: card.address,
        addressLocality: card.city,
      },
    },
  };

  if (card.organizer.trim()) {
    event.organizer = { "@type": "Person", name: card.organizer.trim() };
  }
  if (Number.isFinite(card.price) && card.price >= 0) {
    event.offers = {
      "@type": "Offer",
      price: card.price,
      priceCurrency: "CZK",
      url: canonicalUrl,
      availability: "https://schema.org/InStock",
    };
  }

  return serializeJsonLd(event);
};

const robotsMeta = (visibility: EventSeoCard["visibility"]) =>
  isIndexableEventVisibility(visibility)
    ? '<meta name="robots" content="index,follow" />'
    : '<meta name="robots" content="noindex,nofollow" />';

const beautyLandingUrl = (origin: string, slug: string, language: string, date: string) => {
  const url = new URL(`/beauty/${encodeURIComponent(slug)}/${language}`, origin);
  if (date) url.searchParams.set("date", date);
  return url.toString();
};

const canonicalBeautyUrl = (origin: string, slug: string) =>
  new URL(`/s/${encodeURIComponent(slug)}`, origin).toString();

export const buildBeautyServiceJsonLd = (
  card: Parameters<typeof renderBeautyShareCardJpeg>[0],
  canonicalUrl: string,
  imageUrl: string,
) => serializeJsonLd({
  "@context": "https://schema.org",
  "@type": "Service",
  name: card.title || card.activity || "GO IRL Beauty",
  description: card.description || undefined,
  provider: card.organizer ? { "@type": "Person", name: card.organizer } : undefined,
  areaServed: card.city || undefined,
  image: imageUrl,
  url: canonicalUrl,
  offers: Number.isFinite(card.price) && Number(card.price) >= 0
    ? {
        "@type": "Offer",
        price: Number(card.price),
        priceCurrency: "CZK",
        url: canonicalUrl,
      }
    : undefined,
});

export const setCardImageResponseHeaders = (
  response: Pick<VercelResponse, "setHeader">,
  contentLength: number,
  asAttachment = false,
  cacheControl = "public, max-age=300, s-maxage=300",
  filename = "go-irl-card.jpg",
) => {
  response.setHeader("Content-Type", "image/jpeg");
  response.setHeader("Content-Length", String(contentLength));
  response.setHeader("Cache-Control", cacheControl);
  if (asAttachment) {
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("Access-Control-Allow-Origin", "https://web.telegram.org");
  } else {
    response.setHeader("Access-Control-Allow-Origin", "*");
  }
};

const sendCardImage = async (
  card: Parameters<typeof renderTelegramShareCardJpeg>[0],
  response: VercelResponse,
  asAttachment = false,
  filename = "go-irl-card.jpg",
) => {
  const jpeg = await renderTelegramShareCardJpeg(card);
  setCardImageResponseHeaders(response, jpeg.length, asAttachment, "public, max-age=300, s-maxage=300", filename);
  return response.status(200).end(jpeg);
};

const sendActivityAliasCardImage = async (
  card: Parameters<typeof renderTelegramShareCardJpeg>[0],
  alias: string,
  response: VercelResponse,
  asAttachment = false,
) => {
  response.setHeader("X-Go-Irl-Share-Alias", alias);
  response.setHeader("Access-Control-Expose-Headers", "X-Go-Irl-Share-Alias, Content-Disposition");
  return sendCardImage(card, response, asAttachment, `${alias}-${card.language}.jpg`);
};

const sendBeautyCardImage = async (
  card: Parameters<typeof renderBeautyShareCardJpeg>[0],
  response: VercelResponse,
  asAttachment = false,
  filename = "go-irl-service.jpg",
) => {
  const jpeg = await renderTelegramBeautyShareCardJpeg(card);
  setCardImageResponseHeaders(response, jpeg.length, asAttachment, "public, max-age=300, s-maxage=300", filename);
  return response.status(200).end(jpeg);
};

const handleBeautyPreview = async (
  slug: string,
  language: keyof typeof metaBeautyPreviewCopy,
  date: string,
  format: string,
  response: VercelResponse,
) => {
  const appOrigin = publicAppOrigin();
  const card = await loadTrustedTelegramBeautyCard(slug, language, date, "", appOrigin);
  if (!card) {
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    return response.status(404).end("not_found");
  }
  if (format === "image" || format === "download") {
    return sendBeautyCardImage(
      card,
      response,
      format === "download",
      `${slug}-${language}.jpg`,
    );
  }

  const canonicalUrl = canonicalBeautyUrl(appOrigin, slug);
  const openUrl = beautyLandingUrl(appOrigin, slug, language, date);
  const image = new URL("/api/meta/event-preview", appOrigin);
  image.searchParams.set("slug", slug);
  image.searchParams.set("language", language);
  if (date) image.searchParams.set("date", date);
  image.searchParams.set("format", "image");
  image.searchParams.set("v", "13");
  const imageUrl = image.toString();
  const title = card.activity || card.organizer || "GO IRL Beauty";
  const description = card.description || [card.title, card.date, card.address, card.price ? `${card.price} Kč` : ""]
    .filter(Boolean)
    .join(" · ");
  const jsonLd = buildBeautyServiceJsonLd(card, canonicalUrl, imageUrl);

  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return response.status(200).end(`<!doctype html>
<html lang="${escapeHtml(card.language)}"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
<meta name="robots" content="index,follow" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="GO IRL" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1080" /><meta property="og:image:height" content="900" />
<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
<script type="application/ld+json">${jsonLd}</script>
<style>:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#080b0d;color:#fff}*{box-sizing:border-box}body{margin:0;padding:24px;min-height:100vh;background:#080b0d}.card{max-width:680px;margin:auto;background:#17101f;border:2px solid #d9ad4a;border-radius:24px;overflow:hidden}.hero{width:100%;display:block;aspect-ratio:6/5;object-fit:contain;background:#0a0e10}.content{padding:22px}h1{margin:0 0 10px}.meta{color:#ddd1e7;line-height:1.5;margin-bottom:20px}.actions{display:grid;gap:12px}.btn{display:block;padding:15px;text-align:center;text-decoration:none;border-radius:14px;font-weight:800}.primary{background:#d9ad4a;color:#17101f}.secondary{background:#2b2331;color:#fff}</style>
</head><body><main class="card"><img class="hero" src="${escapeHtml(imageUrl)}" alt="" /><div class="content"><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(description)}</div><div class="actions"><a class="btn primary" href="${escapeHtml(openUrl)}">${escapeHtml(metaBeautyPreviewCopy[card.language].open)}</a><a class="btn secondary" href="${escapeHtml(card.inviteUrl)}">${escapeHtml(metaBeautyPreviewCopy[card.language].telegram)}</a></div></div></main></body></html>`);
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).end("method_not_allowed");
  }

  const eventId = first(request.query?.event);
  const alias = first(request.query?.alias);
  const beautySlug = first(request.query?.slug);
  const language = first(request.query?.language) || "ru";
  const date = first(request.query?.date) || "";
  const format = first(request.query?.format) || "";
  if (!isShareLanguage(language) || date.length > 80) return response.status(404).end("not_found");

  try {
    if (alias) {
      const resolvedEventId = await resolveActivitySharePublicAlias(alias);
      if (!resolvedEventId) return response.status(404).end("not_found");
      const card = await loadTrustedTelegramEventCard(resolvedEventId, language);
      if (!card) {
        response.setHeader("X-Robots-Tag", "noindex, nofollow");
        return response.status(404).end("not_found");
      }
      if (format === "image" || format === "download") {
        return await sendActivityAliasCardImage(card, alias, response, format === "download");
      }

      const appOrigin = publicAppOrigin();
      const canonicalUrl = canonicalEventUrl(appOrigin, card.eventId);
      const openUrl = eventLandingUrl(appOrigin, card.eventId, card.language);
      const image = new URL("/api/meta/event-preview", appOrigin);
      image.searchParams.set("alias", alias);
      image.searchParams.set("language", card.language);
      image.searchParams.set("format", "image");
      const title = card.title || card.activity || "GO IRL";
      const description = [[card.date, card.time].filter(Boolean).join(" · "), card.address].filter(Boolean).join(" · ");

      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
      return response.status(200).end(`<!doctype html><html lang="${escapeHtml(card.language)}"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
${robotsMeta(card.visibility)}
<meta property="og:type" content="website" /><meta property="og:site_name" content="GO IRL" />
<meta property="og:title" content="${escapeHtml(title)}" /><meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(image.toString())}" /><meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1080" /><meta property="og:image:height" content="900" />
<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image.toString())}" />
<style>:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#080b0d;color:#f7f8f9}*{box-sizing:border-box}body{margin:0;padding:24px;background:#080b0d;min-height:100vh}.card{max-width:680px;margin:auto;background:#12181c;border:1px solid #2d383e;border-radius:24px;overflow:hidden}.hero{width:100%;display:block;aspect-ratio:6/5;object-fit:contain;background:#0a0e10}.content{padding:22px}.meta{color:#c8d0d5;line-height:1.5;margin-bottom:20px}.actions{display:grid;gap:12px}.btn{display:block;text-align:center;text-decoration:none;border-radius:14px;padding:15px 18px;font-weight:800}.primary{background:#c9ff3d;color:#101410}.secondary{background:#263038;color:#fff}</style>
</head><body><main class="card"><img class="hero" src="${escapeHtml(image.toString())}" alt="" /><div class="content"><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(description)}</div><div class="actions"><a class="btn primary" href="${escapeHtml(openUrl)}">${escapeHtml(metaEventPreviewCopy[card.language].open)}</a><a class="btn secondary" href="${escapeHtml(card.inviteUrl)}">${escapeHtml(metaEventPreviewCopy[card.language].telegram)}</a></div></div></main></body></html>`);
    }

    if (isBeautyShareSlug(beautySlug)) return await handleBeautyPreview(beautySlug, language, date, format, response);
    if (!isShareEventId(eventId)) return response.status(404).end("not_found");
    const card = await loadTrustedTelegramEventCard(eventId, language);
    if (!card) {
      response.setHeader("X-Robots-Tag", "noindex, nofollow");
      return response.status(404).end("not_found");
    }
    if (format === "download") {
      const publicAlias = await ensureActivitySharePublicAlias(card);
      return await sendActivityAliasCardImage(card, publicAlias, response, true);
    }
    if (format === "image") {
      return await sendCardImage(card, response);
    }

    const appOrigin = publicAppOrigin();
    const canonicalUrl = canonicalEventUrl(appOrigin, card.eventId);
    if (first(request.query?.format) === "ics") {
      response.setHeader("Content-Type", "text/calendar; charset=utf-8");
      response.setHeader("Content-Disposition", `attachment; filename="go-irl-${card.eventId}.ics"`);
      response.setHeader("Cache-Control", "private, max-age=300");
      return response.status(200).end(buildMetaEventCalendar(card, canonicalUrl));
    }
    const openUrl = eventLandingUrl(appOrigin, card.eventId, card.language);
    const telegramUrl = card.inviteUrl;
    const publicAlias = await ensureActivitySharePublicAlias(card);
    const image = new URL("/api/meta/event-preview", appOrigin);
    image.searchParams.set("alias", publicAlias);
    image.searchParams.set("language", card.language);
    image.searchParams.set("format", "image");
    const imageUrl = image.toString();
    const title = card.title || card.activity || "GO IRL";
    const description = [[card.date, card.time].filter(Boolean).join(" · "), card.address].filter(Boolean).join(" · ");
    const labels = metaEventPreviewCopy[card.language];
    const attributionCapture = first(request.query?.capture) === activityAttributionProbe
      ? buildEventAttributionCapture(card.eventId, request.query)
      : null;
    const jsonLd = buildEventJsonLd(card, canonicalUrl, imageUrl);

    if (!isIndexableEventVisibility(card.visibility)) {
      response.setHeader("X-Robots-Tag", "noindex, nofollow");
    }

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader(
      "Cache-Control",
      attributionCapture?.attributed ? "no-store" : "public, max-age=300, s-maxage=300",
    );
    const html = `<!doctype html>
<html lang="${escapeHtml(card.language)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
${robotsMeta(card.visibility)}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="GO IRL" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" />
<meta property="og:image:width" content="1080" />
<meta property="og:image:height" content="900" />
<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ""}
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#080b0d;color:#f7f8f9}*{box-sizing:border-box}body{margin:0;padding:24px;background:linear-gradient(180deg,#11171b,#080b0d);min-height:100vh}.wrap{max-width:680px;margin:0 auto}.card{background:#12181c;border:1px solid #2d383e;border-radius:24px;overflow:hidden;box-shadow:0 20px 70px #0008}.hero{width:100%;display:block;aspect-ratio:18/17;object-fit:contain;background:#0a0e10}.content{padding:22px}h1{margin:0 0 10px;font-size:30px;line-height:1.15}.meta{color:#c8d0d5;font-size:17px;line-height:1.5;margin-bottom:20px}.actions{display:grid;gap:12px}.btn{display:block;text-align:center;text-decoration:none;border-radius:14px;padding:15px 18px;font-weight:800;font-size:17px}.primary{background:#c9ff3d;color:#101410}.secondary{background:#263038;color:#fff}
</style>
</head>
<body><main class="wrap"><article class="card">
<img class="hero" src="${escapeHtml(imageUrl)}" alt="" />
<div class="content"><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(description)}</div>
<div class="actions">
<a class="btn primary" href="${escapeHtml(openUrl)}">${escapeHtml(labels.open)}</a>
<a class="btn secondary" href="${escapeHtml(telegramUrl)}">${escapeHtml(labels.telegram)}</a>
</div></div></article></main></body></html>`;
    return response.status(200).end(attributionCapture
      ? html.replace("</head>", `${attributionCapture.script}\n</head>`)
      : html);
  } catch {
    return response.status(503).end("preview_unavailable");
  }
}
