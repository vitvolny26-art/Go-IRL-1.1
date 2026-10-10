import { renderCityPostersSportMatchArtworkJpeg } from "../_shared/city-posters-sport-match-artwork.js";
import {
  parseCityPostersSportTeams,
  resolveCityPostersSportTeamRendererEmblem,
} from "../_shared/city-posters-sport-team-emblems.js";
import { readEnv } from "../_shared/env.js";
import { freshActivityShareCardJpeg } from "../_shared/activity-share-card-storage.js";
import { readImageRenderToken } from "../_shared/image-render-token.js";
import { isShareLanguage, loadTrustedTelegramEventCard } from "../_shared/telegram-share-event.js";
import {
  isCityPostersShareSlug,
  loadTrustedCityPostersShareCard,
} from "../_shared/telegram-share-city-posters.js";
import { renderTelegramActivityShareCardJpeg } from "../_shared/telegram-activity-share-card-image.js";
import { renderMetaInvitationCardJpeg, renderTelegramShareCardJpeg } from "../_shared/telegram-share-card-image.js";
import {
  readMetaInvitationCardToken,
  readTelegramShareCardToken,
} from "../_shared/telegram-share-card-token.js";

let sharpPromise: Promise<typeof import("sharp").default> | null = null;

const loadSharp = () => {
  sharpPromise ||= import("sharp").then((module) => module.default);
  return sharpPromise;
};

type VercelRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  end(body?: string | Uint8Array): void;
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
};

const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const cityPostersFallbackArtwork = (vertical: string) => {
  const category = ["cinema", "concerts", "festivals", "sport"].includes(vertical)
    ? vertical
    : ["theatre", "comedy", "exhibitions"].includes(vertical)
      ? "culture"
      : "events";
  return `https://go-irl.fun/city-posters/category-backgrounds/${category}.webp`;
};

async function renderMetaCard(token: string, response: VercelResponse) {
  const secrets = [readEnv("META_APP_SECRET"), readEnv("INSTAGRAM_APP_SECRET")].filter(Boolean);
  const card = secrets.reduce<ReturnType<typeof readMetaInvitationCardToken>>(
    (result, secret) => result || readMetaInvitationCardToken(token, secret),
    null,
  );
  if (!card) return response.status(404).end("not_found");

  try {
    const jpeg = await renderMetaInvitationCardJpeg(card);
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(jpeg.length));
    response.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return response.status(200).end(jpeg);
  } catch {
    return response.status(500).end("render_failed");
  }
}

async function renderTelegramCard(token: string, response: VercelResponse) {
  const secret = readEnv("TELEGRAM_BOT_TOKEN");
  if (!secret) return response.status(404).end("not_found");

  const card = readTelegramShareCardToken(token, secret);
  if (!card) return response.status(404).end("not_found");

  try {
    const jpeg = await renderTelegramActivityShareCardJpeg(card);
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(jpeg.length));
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    return response.status(200).end(jpeg);
  } catch {
    return response.status(500).end("render_failed");
  }
}

async function renderPersistedTelegramCard(token: string, response: VercelResponse) {
  const secret = readEnv("TELEGRAM_BOT_TOKEN");
  if (!secret) return response.status(404).end("not_found");

  const tokenCard = readTelegramShareCardToken(token, secret);
  if (!tokenCard) return response.status(404).end("not_found");

  let card: Awaited<ReturnType<typeof loadTrustedTelegramEventCard>>;
  try {
    card = await loadTrustedTelegramEventCard(tokenCard.eventId, tokenCard.language, { includeParticipants: false });
  } catch {
    console.warn("telegram_persisted_card_failed", { stage: "load_card" });
    return response.status(500).end("persisted_card_failed");
  }
  if (!card) return response.status(404).end("not_found");
  if (!card.organizerAvatarUrl
    && tokenCard.organizerAvatarUrl
    && card.organizerKey === tokenCard.organizerKey) {
    card.organizerAvatarUrl = tokenCard.organizerAvatarUrl;
  }

  try {
    const result = await freshActivityShareCardJpeg(card);
    if (result.storageStage) {
      console.warn("telegram_persisted_card_storage_fallback", { stage: result.storageStage });
    }
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(result.jpeg.length));
    response.setHeader("Cache-Control", "private, max-age=60");
    return response.status(200).end(result.jpeg);
  } catch {
    console.warn("telegram_persisted_card_failed", { stage: "render_card" });
    return response.status(500).end("persisted_card_failed");
  }
}

async function renderCityPostersCard(request: VercelRequest, response: VercelResponse) {
  const slug = firstQueryValue(request.query?.slug);
  const language = firstQueryValue(request.query?.language);
  if (!isCityPostersShareSlug(slug) || !isShareLanguage(language)) return response.status(404).end("not_found");

  try {
    const card = await loadTrustedCityPostersShareCard(slug, language);
    if (!card) return response.status(404).end("not_found");
    const fallbackArtworkUrl = cityPostersFallbackArtwork(card.vertical);
    const artworkUrls = [card.heroMediaUrl, fallbackArtworkUrl]
      .filter((value, index, values): value is string => typeof value === "string" && /^https:\/\//i.test(value) && values.indexOf(value) === index);
    let jpeg: Buffer | null = null;
    for (const artworkUrl of artworkUrls) {
      try {
        const artwork = await fetch(artworkUrl, { redirect: "follow" });
        if (!artwork.ok) continue;
        const candidate = Buffer.from(await artwork.arrayBuffer());
        if (candidate.length > 8 * 1024 * 1024) continue;
        const sharp = await loadSharp();
        jpeg = await sharp(candidate)
          .resize(1200, 900, { fit: "cover", position: "centre" })
          .jpeg({ quality: 88 })
          .toBuffer();
        break;
      } catch {
        continue;
      }
    }
    if (!jpeg) return response.status(502).end("artwork_unavailable");
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(jpeg.length));
    response.setHeader("Cache-Control", "public, max-age=300");
    return response.status(200).end(jpeg);
  } catch {
    return response.status(503).end("share_card_unavailable");
  }
}


async function renderCityPostersSportCard(request: VercelRequest, response: VercelResponse) {
  const slug = firstQueryValue(request.query?.slug);
  const variant = firstQueryValue(request.query?.variant);
  if (!isCityPostersShareSlug(slug) || (variant !== "for-you" && variant !== "catalog")) {
    return response.status(404).end("not_found");
  }

  try {
    const card = await loadTrustedCityPostersShareCard(slug, "cs");
    if (!card || card.vertical !== "sport" || !card.subcategory) return response.status(404).end("not_found");
    const teams = parseCityPostersSportTeams(card.title);
    if (!teams) return response.status(422).end("invalid_match_title");

    const jpeg = await renderCityPostersSportMatchArtworkJpeg({
      sportType: card.subcategory,
      variant,
      homeTeamName: teams.homeTeamName,
      awayTeamName: teams.awayTeamName,
      homeLogoUrl: resolveCityPostersSportTeamRendererEmblem(teams.homeTeamName),
      awayLogoUrl: resolveCityPostersSportTeamRendererEmblem(teams.awayTeamName),
    });
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(jpeg.length));
    response.setHeader("Cache-Control", "public, max-age=300");
    return response.status(200).end(jpeg);
  } catch {
    return response.status(503).end("sport_artwork_unavailable");
  }
}

async function renderImageCard(token: string, response: VercelResponse) {
  const secret = readEnv("IMAGE_RENDER_SECRET");
  if (!secret) return response.status(503).end("render_unavailable");
  const renderRequest = readImageRenderToken(token, secret);
  if (!renderRequest) return response.status(404).end("not_found");

  try {
    const jpeg = renderRequest.mode === "meta-event"
      ? await renderMetaInvitationCardJpeg(renderRequest.card)
      : await renderTelegramShareCardJpeg(renderRequest.card);
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(jpeg.length));
    response.setHeader(
      "Cache-Control",
      renderRequest.mode === "meta-event"
        ? "public, max-age=86400, immutable"
        : "private, max-age=60",
    );
    return response.status(200).end(jpeg);
  } catch {
    console.warn("image_render_failed", { mode: renderRequest.mode });
    return response.status(500).end("render_failed");
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).end("method_not_allowed");
  }

  const mode = firstQueryValue(request.query?.mode);
  if (mode === "city-posters") return renderCityPostersCard(request, response);
  if (mode === "city-posters-sport") return renderCityPostersSportCard(request, response);

  const token = firstQueryValue(request.query?.token);
  if (!token || token.length > 8_000) return response.status(404).end("not_found");

  if (mode === "render") return renderImageCard(token, response);
  if (mode === "meta") return renderMetaCard(token, response);
  if (mode === "persisted") return renderPersistedTelegramCard(token, response);
  return renderTelegramCard(token, response);
}
