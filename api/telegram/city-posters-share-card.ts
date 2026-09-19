import sharp from "sharp";
import { isShareLanguage } from "../_shared/telegram-share-event.js";
import {
  isCityPostersShareSlug,
  loadTrustedCityPostersShareCard,
} from "../_shared/telegram-share-city-posters.js";

type VercelRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  end(body?: string | Uint8Array): void;
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
};

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const fallbackArtwork: Record<string, string> = {
  "cinestar-kino-days-2026-olomouc": "https://go-irl.fun/offers/cinestar-kino-days-2026.webp",
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).end("method_not_allowed");
  }

  const slug = first(request.query?.slug);
  const language = first(request.query?.language);
  if (!isCityPostersShareSlug(slug) || !isShareLanguage(language)) return response.status(404).end("not_found");

  try {
    const card = await loadTrustedCityPostersShareCard(slug, language);
    if (!card) return response.status(404).end("not_found");
    const artworkUrl = card.heroMediaUrl || fallbackArtwork[slug];
    if (!artworkUrl || !/^https:\/\//i.test(artworkUrl)) return response.status(404).end("not_found");

    const artwork = await fetch(artworkUrl, { redirect: "follow" });
    if (!artwork.ok) return response.status(502).end("artwork_unavailable");
    const source = Buffer.from(await artwork.arrayBuffer());
    if (source.length > 8 * 1024 * 1024) return response.status(413).end("artwork_too_large");

    const jpeg = await sharp(source)
      .resize(1200, 900, { fit: "cover", position: "centre" })
      .jpeg({ quality: 88 })
      .toBuffer();
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(jpeg.length));
    response.setHeader("Cache-Control", "public, max-age=300");
    return response.status(200).end(jpeg);
  } catch {
    return response.status(503).end("share_card_unavailable");
  }
}
