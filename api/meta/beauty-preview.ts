import { readEnv } from "../_shared/env.js";
import {
  isBeautyShareSlug,
  isShareLanguage,
  loadTrustedTelegramBeautyCard,
} from "../_shared/telegram-share-beauty.js";
import { socialAttributionParamKeys, parseSocialAttribution } from "../../src/socialAttribution.js";

type VercelRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  end(body?: string): void;
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
};

const fallbackOrigin = "https://go-irl.fun";
const publicOrigin = () => (readEnv("GO_IRL_PUBLIC_ORIGIN") || readEnv("VITE_GO_IRL_PUBLIC_ORIGIN") || fallbackOrigin).replace(/\/+$/, "");
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const copy = {
  ru: "Открыть GO IRL",
  uk: "Відкрити GO IRL",
  cs: "Otevřít GO IRL",
  en: "Open GO IRL",
} as const;

export const buildBeautyAttributedOpenUrl = (
  origin: string,
  slug: string,
  language: string,
  query: VercelRequest["query"],
) => {
  const target = new URL(`/beauty/${encodeURIComponent(slug)}/${language}`, origin);
  const raw = new URLSearchParams();
  for (const key of socialAttributionParamKeys) {
    const value = first(query?.[key]);
    if (value) raw.set(key, value);
  }
  const attribution = parseSocialAttribution(raw);
  for (const key of socialAttributionParamKeys) {
    const value = attribution[key];
    if (value) target.searchParams.set(key, value);
  }
  return target.toString();
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).end("method_not_allowed");
  }

  const slug = first(request.query?.slug) || "";
  const language = first(request.query?.language) || "ru";
  const date = first(request.query?.date) || "";
  if (!isBeautyShareSlug(slug) || !isShareLanguage(language) || date.length > 80) {
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    return response.status(404).end("not_found");
  }

  const origin = publicOrigin();
  const card = await loadTrustedTelegramBeautyCard(slug, language, date, "", origin).catch(() => null);
  if (!card) {
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    return response.status(404).end("not_found");
  }

  const canonicalUrl = new URL(`/s/${encodeURIComponent(slug)}`, origin).toString();
  const openUrl = buildBeautyAttributedOpenUrl(origin, slug, language, request.query);
  const image = new URL("/api/meta/event-preview", origin);
  image.searchParams.set("slug", slug);
  image.searchParams.set("language", language);
  if (date) image.searchParams.set("date", date);
  image.searchParams.set("format", "image");
  image.searchParams.set("v", "15");
  const imageUrl = image.toString();
  const title = card.activity || card.organizer || "GO IRL Beauty";
  const description = card.description || [card.title, card.date, card.address, card.price ? `${card.price} Kč` : ""]
    .filter(Boolean)
    .join(" · ");

  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return response.status(200).end(`<!doctype html><html lang="${escapeHtml(language)}"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonicalUrl)}" /><meta name="robots" content="index,follow" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="GO IRL" />
<meta property="og:title" content="${escapeHtml(title)}" /><meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" /><meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" /><meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
<style>:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#080b0d;color:#fff}*{box-sizing:border-box}body{margin:0;padding:24px;min-height:100vh;background:#080b0d}.card{max-width:680px;margin:auto;background:#17101f;border:2px solid #d9ad4a;border-radius:24px;overflow:hidden}.hero{width:100%;display:block;aspect-ratio:6/5;object-fit:contain;background:#0a0e10}.content{padding:22px}h1{margin:0 0 10px}.meta{color:#ddd1e7;line-height:1.5;margin-bottom:20px}.btn{display:block;padding:15px;text-align:center;text-decoration:none;border-radius:14px;font-weight:800;background:#d9ad4a;color:#17101f}</style>
</head><body><main class="card"><img class="hero" src="${escapeHtml(imageUrl)}" alt="" /><div class="content"><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(description)}</div><a class="btn" href="${escapeHtml(openUrl)}">${escapeHtml(copy[language])}</a></div></main></body></html>`);
}
