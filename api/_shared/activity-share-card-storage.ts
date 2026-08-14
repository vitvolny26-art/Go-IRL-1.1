import { createClient } from "@supabase/supabase-js";
import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { readEnv } from "./env.js";
import { renderTelegramShareCardJpeg } from "./telegram-share-card-image.js";

export const ACTIVITY_SHARE_CARD_BUCKET = "activity-share-cards";
const ACTIVITY_SHARE_ALIAS_PREFIX = "_aliases";
const eventIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publicAliasPattern = /^[A-Z][a-z]{2}[0-9]{6}_[a-z]{1,2}$/;
const shareLanguages = ["ru", "uk", "cs", "en"] as const;

const storageClient = () => {
  const url = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("activity_share_card_storage_unavailable");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

const cyrillicAliasMap: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", ё: "e", є: "ie", ж: "zh", з: "z", и: "i", і: "i", ї: "i",
  й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
const activityCode = (value: string) => { const ascii = value.normalize("NFKD").toLowerCase().split("").map((c) => cyrillicAliasMap[c] ?? c).join("").replace(/[^a-z]/g, ""); const code = `${ascii}act`.slice(0, 3); return `${code[0]?.toUpperCase() || "A"}${code.slice(1)}`; };
const compactDate = (value: string) => value.replaceAll("-", "").slice(2, 8) || "000000";
const collisionSuffix = (index: number) => { let value = index; let suffix = ""; do { suffix = String.fromCharCode(97 + (value % 26)) + suffix; value = Math.floor(value / 26) - 1; } while (value >= 0); return suffix; };
export const isActivitySharePublicAlias = (value: unknown): value is string => typeof value === "string" && publicAliasPattern.test(value.trim());
export const activityShareCardAlias = (card: TelegramEventCardInput, suffixIndex = 0) => `${activityCode(card.activity)}${compactDate(card.eventDate)}_${collisionSuffix(suffixIndex)}`;
const markerPath = (alias: string) => `${ACTIVITY_SHARE_ALIAS_PREFIX}/${alias}.marker.jpg`;
const imagePath = (eventId: string, alias: string, language?: string) => `${eventId}/${alias}${language ? `-${language}` : ""}.jpg`;
const readTextObject = async (path: string) => { const result = await storageClient().storage.from(ACTIVITY_SHARE_CARD_BUCKET).download(path); if (result.error) return null; return (await result.data.text()).trim(); };
const existingPublicAlias = async (eventId: string) => { const result = await storageClient().storage.from(ACTIVITY_SHARE_CARD_BUCKET).list(eventId, { limit: 100 }); if (result.error) throw result.error; const jpeg = result.data.find((item) => item.name.endsWith(".jpg") && isActivitySharePublicAlias(item.name.slice(0, -4))); if (jpeg) return jpeg.name.slice(0, -4); for (const item of result.data) { const match = item.name.match(/^([A-Z][a-z]{2}[0-9]{6}_[a-z]{1,2})-(?:ru|uk|cs|en)\.jpg$/); if (match && isActivitySharePublicAlias(match[1])) return match[1]; } return null; };
export const ensureActivitySharePublicAlias = async (card: TelegramEventCardInput) => { const current = await existingPublicAlias(card.eventId); if (current) return current; const client = storageClient(); for (let suffixIndex = 0; suffixIndex < 702; suffixIndex += 1) { const alias = activityShareCardAlias(card, suffixIndex); const marker = markerPath(alias); const uploaded = await client.storage.from(ACTIVITY_SHARE_CARD_BUCKET).upload(marker, new TextEncoder().encode(card.eventId), { cacheControl: "31536000", contentType: "image/jpeg", upsert: false }); if (!uploaded.error) return alias; const owner = await readTextObject(marker); if (owner === card.eventId) return alias; if (owner) continue; throw uploaded.error; } throw new Error("activity_share_alias_capacity_exhausted"); };
export const resolveActivitySharePublicAlias = async (alias: unknown) => { if (!isActivitySharePublicAlias(alias)) return null; const eventId = await readTextObject(markerPath(alias)); return eventId && eventIdPattern.test(eventId) ? eventId : null; };
export const persistActivityShareCard = async (card: TelegramEventCardInput, alias?: string, jpeg?: Uint8Array) => { const client = storageClient(); const publicAlias = alias || await ensureActivitySharePublicAlias(card); const bytes = jpeg || await renderTelegramShareCardJpeg(card); const path = imagePath(card.eventId, publicAlias, card.language); const result = await client.storage.from(ACTIVITY_SHARE_CARD_BUCKET).upload(path, bytes, { cacheControl: "31536000", contentType: "image/jpeg", upsert: true }); if (result.error) throw result.error; return path; };
export const loadActivityShareCard = async (eventId: string, alias: string, language: string) => { if (!eventIdPattern.test(eventId) || !isActivitySharePublicAlias(alias) || !shareLanguages.includes(language as typeof shareLanguages[number])) return null; const result = await storageClient().storage.from(ACTIVITY_SHARE_CARD_BUCKET).download(imagePath(eventId, alias, language)); if (result.error) return null; const jpeg = new Uint8Array(await result.data.arrayBuffer()); return jpeg.length ? jpeg : null; };
export const signedActivityShareCardUrl = async (card: TelegramEventCardInput, expiresIn = 600) => { const client = storageClient(); const alias = await ensureActivitySharePublicAlias(card); const path = imagePath(card.eventId, alias, card.language); if (!await loadActivityShareCard(card.eventId, alias, card.language)) await persistActivityShareCard(card, alias); const result = await client.storage.from(ACTIVITY_SHARE_CARD_BUCKET).createSignedUrl(path, expiresIn); if (result.error) throw result.error; return result.data.signedUrl; };
export const removeActivityShareCard = async (eventId: string) => { const client = storageClient(); const alias = await existingPublicAlias(eventId); if (!alias) return false; const paths = [markerPath(alias), ...shareLanguages.map((language) => imagePath(eventId, alias, language)), imagePath(eventId, alias)]; const result = await client.storage.from(ACTIVITY_SHARE_CARD_BUCKET).remove(paths); if (result.error) throw result.error; return true; };
