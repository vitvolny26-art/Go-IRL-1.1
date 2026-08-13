import { createClient } from "@supabase/supabase-js";
import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { readEnv } from "./env.js";
import { renderTelegramShareCardJpeg } from "./telegram-share-card-image.js";

export const ACTIVITY_SHARE_CARD_BUCKET = "activity-share-cards";

const storageClient = () => {
  const url = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("activity_share_card_storage_unavailable");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

const aliasPart = (value: string) => value
  .normalize("NFKD")
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase()
  .slice(0, 18) || "activity";

const compactDate = (value: string) => value.replaceAll("-", "").slice(2, 8) || "000000";

export const activityShareCardAlias = (card: TelegramEventCardInput) =>
  `${aliasPart(card.activity)}${compactDate(card.eventDate)}_${card.eventId.slice(0, 4).toLowerCase()}.jpg`;

const existingPath = async (eventId: string) => {
  const result = await storageClient().storage.from(ACTIVITY_SHARE_CARD_BUCKET).list(eventId, { limit: 10 });
  if (result.error) throw result.error;
  const jpeg = result.data.find((item) => item.name.toLowerCase().endsWith(".jpg"));
  return jpeg ? `${eventId}/${jpeg.name}` : null;
};

export const persistActivityShareCard = async (card: TelegramEventCardInput) => {
  const client = storageClient();
  const currentPath = await existingPath(card.eventId);
  const path = currentPath || `${card.eventId}/${activityShareCardAlias(card)}`;
  const jpeg = await renderTelegramShareCardJpeg(card);
  const result = await client.storage.from(ACTIVITY_SHARE_CARD_BUCKET).upload(path, jpeg, {
    cacheControl: "31536000",
    contentType: "image/jpeg",
    upsert: true,
  });
  if (result.error) throw result.error;
  return path;
};

export const signedActivityShareCardUrl = async (card: TelegramEventCardInput, expiresIn = 600) => {
  const client = storageClient();
  const path = await existingPath(card.eventId) || await persistActivityShareCard(card);
  const result = await client.storage.from(ACTIVITY_SHARE_CARD_BUCKET).createSignedUrl(path, expiresIn);
  if (result.error) throw result.error;
  return result.data.signedUrl;
};

export const removeActivityShareCard = async (eventId: string) => {
  const client = storageClient();
  const path = await existingPath(eventId);
  if (!path) return false;
  const result = await client.storage.from(ACTIVITY_SHARE_CARD_BUCKET).remove([path]);
  if (result.error) throw result.error;
  return true;
};
