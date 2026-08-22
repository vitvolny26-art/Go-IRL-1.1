import {
  getCurrentAuthIdentity,
  getCurrentUserRole,
  initializeTrustedAuth,
  isBrowserMockMode,
} from "../authSession";
import { getUserKey, supabase } from "../supabase";
import type { BeautyShareCard, BeautyWorkspace } from "./beautySetupModel";
import { buildBeautySocialAssets } from "./beautySocialShareAssets";

const assetBucket = "beauty-share-assets";
const generatedBucket = "beauty-share-cards";
const templateVersion = 3;
let expectedCardUpdatedAt: string | null = null;
let currentBackgroundObjectPath: string | null = null;
let currentLogoObjectPath: string | null = null;
let currentGeneratedObjectPath: string | null = null;

type ShareCardRow = { profile_id: string; template_version: number; card_status: BeautyShareCard["status"]; background_object_path: string | null; logo_object_path: string | null; generated_object_path: string | null; background_position_y: number; service_ids: string[] | null; source_fingerprint: string; error_message: string; generated_at: string | null; updated_at: string; };
type SaveRow = { save_status: "saved" | "conflict"; profile_id: string; card_status: BeautyShareCard["status"]; updated_at: string; };
const usesTrustedBeautyStorage = () => { const identity = getCurrentAuthIdentity(); return !isBrowserMockMode() && (identity?.source === "trusted-telegram" || identity?.source === "trusted-provider") && getCurrentUserRole() === "professional"; };
const ensureTrustedBeautyStorage = async (required: boolean) => { if (isBrowserMockMode()) return false; await initializeTrustedAuth(); if (usesTrustedBeautyStorage()) return true; if (required) throw new Error("beauty_share_trusted_auth_required"); return false; };
const dataUrlToBlob = async (value: string) => { const response = await fetch(value); if (!response.ok) throw new Error("beauty_share_data_url_decode_failed"); return response.blob(); };
const extensionForType = (type: string) => type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
const uploadDataUrl = async (bucket: string, pathWithoutExtension: string, value: string, existingPath: string | null) => { if (!value.startsWith("data:image/")) return existingPath; const blob = await dataUrlToBlob(value); const path = `${pathWithoutExtension}.${extensionForType(blob.type)}`; const { error } = await supabase.storage.from(bucket).upload(path, blob, { cacheControl: "3600", contentType: blob.type || "image/jpeg", upsert: true }); if (error) throw error; return path; };
const signedAssetUrl = async (path: string | null) => { if (!path) return ""; const { data, error } = await supabase.storage.from(assetBucket).createSignedUrl(path, 60 * 60); if (error) throw error; return data.signedUrl; };
const generatedPublicUrl = (path: string | null) => path ? supabase.storage.from(generatedBucket).getPublicUrl(path).data.publicUrl : "";

export const loadRemoteBeautyShareCard = async (workspace: BeautyWorkspace): Promise<BeautyWorkspace> => {
  if (!(await ensureTrustedBeautyStorage(false))) return workspace;
  const result = await supabase.rpc("get_my_beauty_share_card");
  if (result.error) { if (result.error.code === "PGRST202") return workspace; throw result.error; }
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as ShareCardRow | undefined;
  if (!row) { expectedCardUpdatedAt = null; currentBackgroundObjectPath = null; currentLogoObjectPath = null; currentGeneratedObjectPath = null; return workspace; }
  expectedCardUpdatedAt = row.updated_at; currentBackgroundObjectPath = row.background_object_path; currentLogoObjectPath = row.logo_object_path; currentGeneratedObjectPath = row.generated_object_path;
  const [backgroundImageDataUrl, logoImageDataUrl] = await Promise.all([signedAssetUrl(row.background_object_path), signedAssetUrl(row.logo_object_path)]);
  return { ...workspace, shareCard: { ...workspace.shareCard, enabled: row.card_status !== "deleted", backgroundImageDataUrl, logoImageDataUrl, backgroundPositionY: row.background_position_y, serviceIds: Array.isArray(row.service_ids) ? row.service_ids.slice(0, 3) : workspace.shareCard.serviceIds, status: row.card_status, generatedImageDataUrl: generatedPublicUrl(row.generated_object_path), generatedAt: row.generated_at || "", sourceFingerprint: row.source_fingerprint || "", errorMessage: row.error_message || "" } };
};

export const saveRemoteBeautyShareCard = async (workspace: BeautyWorkspace) => {
  if (!(await ensureTrustedBeautyStorage(true))) return;
  const userKey = getUserKey(); const prefix = `${userKey}/beauty-share-card`; const card = workspace.shareCard;
  const [backgroundObjectPath, logoObjectPath, generatedObjectPath] = await Promise.all([
    uploadDataUrl(assetBucket, `${prefix}/background/current`, card.backgroundImageDataUrl, card.backgroundImageDataUrl ? currentBackgroundObjectPath : null),
    uploadDataUrl(assetBucket, `${prefix}/logo/current`, card.logoImageDataUrl, card.logoImageDataUrl ? currentLogoObjectPath : null),
    card.status === "deleted" ? Promise.resolve(null) : uploadDataUrl(generatedBucket, `${prefix}/generated/current`, card.generatedImageDataUrl, card.generatedImageDataUrl ? currentGeneratedObjectPath : null),
  ]);
  const result = await supabase.rpc("save_my_beauty_share_card", { p_template_version: templateVersion, p_status: card.status, p_background_object_path: backgroundObjectPath, p_logo_object_path: logoObjectPath, p_generated_object_path: generatedObjectPath, p_background_position_y: card.backgroundPositionY, p_service_ids: card.serviceIds.slice(0, 3), p_source_fingerprint: card.sourceFingerprint, p_error_message: card.errorMessage, p_generated_at: card.generatedAt || null, p_expected_updated_at: expectedCardUpdatedAt });
  if (result.error) { if (result.error.code === "PGRST202") throw new Error("beauty_share_card_rpc_missing"); throw result.error; }
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as SaveRow | undefined;
  if (!row) throw new Error("beauty_share_card_save_empty_response"); if (row.save_status === "conflict") throw new Error("beauty_share_card_conflict");
  expectedCardUpdatedAt = row.updated_at; currentBackgroundObjectPath = backgroundObjectPath; currentLogoObjectPath = logoObjectPath; currentGeneratedObjectPath = generatedObjectPath;
  if (card.status !== "deleted") {
    const socialAssets = await buildBeautySocialAssets(workspace);
    await Promise.all(socialAssets.map(async ({ language, variant, blob }) => {
      const path = `${prefix}/social/${variant}/${language}.jpg`;
      const { error } = await supabase.storage.from(generatedBucket).upload(path, blob, { cacheControl: "3600", contentType: "image/jpeg", upsert: true });
      if (error) throw error;
    }));
  }
};

export const resetRemoteBeautyShareCardState = () => { expectedCardUpdatedAt = null; currentBackgroundObjectPath = null; currentLogoObjectPath = null; currentGeneratedObjectPath = null; };
