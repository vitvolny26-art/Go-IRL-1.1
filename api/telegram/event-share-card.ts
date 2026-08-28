import { readEnv } from "../_shared/env.js";
import { freshActivityShareCardJpeg } from "../_shared/activity-share-card-storage.js";
import { loadTrustedTelegramEventCard } from "../_shared/telegram-share-event.js";
import { renderTelegramActivityShareCardJpeg } from "../_shared/telegram-activity-share-card-image.js";
import { renderMetaInvitationCardJpeg } from "../_shared/telegram-share-card-image.js";
import {
  readMetaInvitationCardToken,
  readTelegramShareCardToken,
} from "../_shared/telegram-share-card-token.js";

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

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).end("method_not_allowed");
  }

  const token = firstQueryValue(request.query?.token);
  if (!token || token.length > 8_000) return response.status(404).end("not_found");

  const mode = firstQueryValue(request.query?.mode);
  if (mode === "meta") return renderMetaCard(token, response);
  if (mode === "persisted") return renderPersistedTelegramCard(token, response);
  return renderTelegramCard(token, response);
}
