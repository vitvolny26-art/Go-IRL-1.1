import {
  getCurrentAuthIdentity,
  getCurrentUserRole,
  initializeTrustedAuth,
  isBrowserMockMode,
} from "../authSession";
import { getUserKey, supabase } from "../supabase";
import type { Language } from "../types";
import {
  beautyTranslationLanguages,
  type BeautyShareCard,
  type BeautyWorkspace,
} from "./beautySetupModel";
import {
  clearBeautyShareCardGeneratedBatch,
  getBeautyShareCardGeneratedBatch,
} from "./beautyShareCardBatchCache";
import { buildBeautyShareImageAssetKey } from "./beautyShareCardModel";
import {
  resolveBeautyShareCardServiceIdsForPersistence,
  restoreBeautyShareCardServiceIdsFromPersistence,
} from "./beautyShareCardServiceIdentity";
import { buildBeautySocialAssets } from "./beautySocialShareAssets";

const assetBucket = "beauty-share-assets";
const generatedBucket = "beauty-share-cards";
const templateVersion = 3;
const beautyShareUploadTimeoutMs = 10_000;
let expectedCardUpdatedAt: string | null = null;
let currentBackgroundObjectPath: string | null = null;
let currentLogoObjectPath: string | null = null;
let currentGeneratedObjectPath: string | null = null;
let currentSourceFingerprint = "";

type ShareCardRow = { profile_id: string; template_version: number; card_status: BeautyShareCard["status"]; background_object_path: string | null; logo_object_path: string | null; generated_object_path: string | null; background_position_y: number; service_ids: string[] | null; source_fingerprint: string; error_message: string; generated_at: string | null; updated_at: string; };
type SaveRow = { save_status: "saved" | "conflict"; profile_id: string; card_status: BeautyShareCard["status"]; updated_at: string; };
type BeautyProfileIdentityRow = { services?: unknown };
const usesTrustedBeautyStorage = () => { const identity = getCurrentAuthIdentity(); return !isBrowserMockMode() && (identity?.source === "trusted-telegram" || identity?.source === "trusted-provider") && getCurrentUserRole() === "professional"; };
const ensureTrustedBeautyStorage = async (required: boolean) => { if (isBrowserMockMode()) return false; await initializeTrustedAuth(); if (usesTrustedBeautyStorage()) return true; if (required) throw new Error("beauty_share_trusted_auth_required"); return false; };
const dataUrlToBlob = async (value: string) => { const response = await fetch(value); if (!response.ok) throw new Error("beauty_share_data_url_decode_failed"); return response.blob(); };
const extensionForType = (type: string) => type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
const withUploadTimeout = async <T>(operation: PromiseLike<T>) => {
  let timer = 0;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("beauty_share_upload_timeout")), beautyShareUploadTimeoutMs);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
};
const uploadDataUrl = async (bucket: string, objectPrefix: string, value: string, existingPath: string | null) => {
  if (!value.startsWith("data:image/")) return existingPath;
  const blob = await dataUrlToBlob(value);
  const assetKey = buildBeautyShareImageAssetKey(value);
  const path = `${objectPrefix}/${assetKey}.${extensionForType(blob.type)}`;
  const { error } = await withUploadTimeout(supabase.storage.from(bucket).upload(path, blob, { cacheControl: "31536000", contentType: blob.type || "image/jpeg", upsert: true }));
  if (error) throw error;
  return path;
};
const uploadCanonicalJpeg = async (path: string, value: string) => { if (!value.startsWith("data:image/jpeg")) throw new Error("beauty_share_card_batch_invalid"); const blob = await dataUrlToBlob(value); if (blob.type !== "image/jpeg") throw new Error("beauty_share_card_batch_invalid"); const { error } = await withUploadTimeout(supabase.storage.from(generatedBucket).upload(path, blob, { cacheControl: "31536000", contentType: "image/jpeg", upsert: true })); if (error) throw error; return path; };
const signedAssetUrl = async (path: string | null) => { if (!path) return ""; const { data, error } = await supabase.storage.from(assetBucket).createSignedUrl(path, 60 * 60); if (error) throw error; return data.signedUrl; };
const generatedPublicUrl = (path: string | null) => path ? supabase.storage.from(generatedBucket).getPublicUrl(path).data.publicUrl : "";
const localizedGeneratedPath = (path: string | null, language: Language) => path?.replace(/\/telegram\/(?:ru|uk|cs|en|pl|sk)\.jpg$/, `/telegram/${language}.jpg`) || path;
const canonicalBatchPath = (prefix: string, fingerprint: string, language: string) => `${prefix}/generated/${fingerprint}/telegram/${language}.jpg`;
const loadBeautyServiceIdentitySource = async () => {
  const result = await supabase.rpc("get_my_beauty_profile_v3");
  if (result.error) {
    if (result.error.code === "PGRST202" || result.error.message?.includes("Could not find the function")) return null;
    throw result.error;
  }
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as BeautyProfileIdentityRow | undefined;
  return row?.services ?? null;
};

export const loadRemoteBeautyShareCard = async (workspace: BeautyWorkspace, language: Language): Promise<BeautyWorkspace> => {
  if (!(await ensureTrustedBeautyStorage(false))) return workspace;
  const result = await supabase.rpc("get_my_beauty_share_card");
  if (result.error) { if (result.error.code === "PGRST202") return workspace; throw result.error; }
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as ShareCardRow | undefined;
  if (!row) { expectedCardUpdatedAt = null; currentBackgroundObjectPath = null; currentLogoObjectPath = null; currentGeneratedObjectPath = null; currentSourceFingerprint = ""; return workspace; }
  expectedCardUpdatedAt = row.updated_at; currentBackgroundObjectPath = row.background_object_path; currentLogoObjectPath = row.logo_object_path; currentGeneratedObjectPath = row.generated_object_path; currentSourceFingerprint = row.source_fingerprint || "";
  const serviceIdentitySource = Array.isArray(row.service_ids)
    ? await loadBeautyServiceIdentitySource().catch(() => null)
    : null;
  const serviceIds = Array.isArray(row.service_ids)
    ? restoreBeautyShareCardServiceIdsFromPersistence(row.service_ids, serviceIdentitySource)
    : workspace.shareCard.serviceIds;
  const [backgroundImageDataUrl, logoImageDataUrl] = await Promise.all([signedAssetUrl(row.background_object_path), signedAssetUrl(row.logo_object_path)]);
  return { ...workspace, shareCard: { ...workspace.shareCard, enabled: row.card_status !== "deleted", backgroundImageDataUrl, logoImageDataUrl, backgroundPositionY: row.background_position_y, serviceIds, status: row.card_status, generatedImageDataUrl: generatedPublicUrl(localizedGeneratedPath(row.generated_object_path, language)), generatedAt: row.generated_at || "", sourceFingerprint: row.source_fingerprint || "", errorMessage: row.error_message || "" } };
};

export const saveRemoteBeautyShareCard = async (workspace: BeautyWorkspace) => {
  if (!(await ensureTrustedBeautyStorage(true))) return;
  const userKey = getUserKey(); const prefix = `${userKey}/beauty-share-card`; const card = workspace.shareCard;
  const serviceIdentitySource = card.serviceIds.length > 0 ? await loadBeautyServiceIdentitySource() : null;
  const serviceIds = resolveBeautyShareCardServiceIdsForPersistence(card.serviceIds, serviceIdentitySource);
  const [backgroundObjectPath, logoObjectPath] = await Promise.all([
    uploadDataUrl(assetBucket, `${prefix}/background`, card.backgroundImageDataUrl, card.backgroundImageDataUrl ? currentBackgroundObjectPath : null),
    uploadDataUrl(assetBucket, `${prefix}/logo`, card.logoImageDataUrl, card.logoImageDataUrl ? currentLogoObjectPath : null),
  ]);

  let generatedObjectPath = card.status === "deleted" ? null : currentGeneratedObjectPath;
  if (card.status !== "deleted") {
    const generatedBatch = getBeautyShareCardGeneratedBatch(card.sourceFingerprint);
    if (generatedBatch) {
      const uploaded = await Promise.all(beautyTranslationLanguages.map((language) =>
        uploadCanonicalJpeg(canonicalBatchPath(prefix, card.sourceFingerprint, language), generatedBatch[language])));
      generatedObjectPath = uploaded[beautyTranslationLanguages.indexOf("en")];
    } else if (!generatedObjectPath || currentSourceFingerprint !== card.sourceFingerprint) {
      throw new Error("beauty_share_card_batch_missing");
    }
  }

  const result = await supabase.rpc("save_my_beauty_share_card", { p_template_version: templateVersion, p_status: card.status, p_background_object_path: backgroundObjectPath, p_logo_object_path: logoObjectPath, p_generated_object_path: generatedObjectPath, p_background_position_y: card.backgroundPositionY, p_service_ids: serviceIds, p_source_fingerprint: card.sourceFingerprint, p_error_message: card.errorMessage, p_generated_at: card.generatedAt || null, p_expected_updated_at: expectedCardUpdatedAt });
  if (result.error) { if (result.error.code === "PGRST202") throw new Error("beauty_share_card_rpc_missing"); throw result.error; }
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as SaveRow | undefined;
  if (!row) throw new Error("beauty_share_card_save_empty_response"); if (row.save_status === "conflict") throw new Error("beauty_share_card_conflict");
  expectedCardUpdatedAt = row.updated_at; currentBackgroundObjectPath = backgroundObjectPath; currentLogoObjectPath = logoObjectPath; currentGeneratedObjectPath = generatedObjectPath; currentSourceFingerprint = card.sourceFingerprint;
  clearBeautyShareCardGeneratedBatch();

  if (card.status !== "deleted") {
    void (async () => {
      const socialAssets = await buildBeautySocialAssets(workspace);
      await Promise.all(socialAssets.map(async ({ language, variant, blob }) => {
        const path = `${prefix}/social/${variant}/${language}.jpg`;
        const { error } = await withUploadTimeout(supabase.storage.from(generatedBucket).upload(path, blob, { cacheControl: "3600", contentType: "image/jpeg", upsert: true }));
        if (error) throw error;
      }));
    })().catch((error: unknown) => {
      console.warn("beauty_share_social_sync_failed", error instanceof Error ? error.message : "unknown");
    });
  }
};

export const resetRemoteBeautyShareCardState = () => { expectedCardUpdatedAt = null; currentBackgroundObjectPath = null; currentLogoObjectPath = null; currentGeneratedObjectPath = null; currentSourceFingerprint = ""; clearBeautyShareCardGeneratedBatch(); };
