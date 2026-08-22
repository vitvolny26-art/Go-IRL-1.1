import { getCurrentAuthIdentity, isBrowserMockMode } from "../authSession";
import { profileAvatarBucket } from "../profileAvatar";
import { supabase } from "../supabase";
import {
  loadBeautyWorkspace as loadBeautyWorkspaceBase,
  resetBeautyWorkspace as resetBeautyWorkspaceBase,
  saveBeautyWorkspace as saveBeautyWorkspaceBase,
  updateBeautyPublicSlug,
} from "./beautyWorkspaceRepository";
import {
  loadRemoteBeautyShareCard,
  resetRemoteBeautyShareCardState,
  saveRemoteBeautyShareCard,
} from "./beautyShareCardRepository";
import { createBeautyWorkspaceSaveQueue } from "./beautyWorkspaceSaveQueue";
import { saveLocalBeautyWorkspace } from "./beautyWorkspaceLocalStorage";
import type { Language } from "../types";
import type { BeautyWorkspace } from "./beautySetupModel";

export const beautyShareCardPersistenceEvent = "go-irl-beauty-share-card-persistence";

export type BeautyShareCardPersistenceDetail = {
  sourceFingerprint: string;
  status: "ready" | "error";
  errorMessage: string;
};

const dispatchBeautyShareCardPersistence = (detail: BeautyShareCardPersistenceDetail) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<BeautyShareCardPersistenceDetail>(beautyShareCardPersistenceEvent, { detail }));
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error || new Error("beauty_avatar_read_failed"));
  reader.onload = () => resolve(String(reader.result || ""));
  reader.readAsDataURL(blob);
});

export const loadBeautyProfileAvatarDataUrl = async () => {
  if (isBrowserMockMode()) return "";
  const identity = getCurrentAuthIdentity();
  if (!identity || (identity.source !== "trusted-telegram" && identity.source !== "trusted-provider")) return "";

  const profileResult = await supabase
    .from("user_profiles")
    .select("avatar_path")
    .eq("user_key", identity.user.userKey)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;

  const avatarPath = typeof profileResult.data?.avatar_path === "string"
    ? profileResult.data.avatar_path.trim()
    : "";
  if (!avatarPath) return "";

  const download = await supabase.storage.from(profileAvatarBucket).download(avatarPath);
  if (download.error) throw download.error;
  if (!download.data) throw new Error("beauty_avatar_download_empty");
  return blobToDataUrl(download.data);
};

export const prepareBeautyWorkspaceForPersistence = (workspace: BeautyWorkspace) => {
  const card = workspace.shareCard;
  if (
    !card.enabled
    || card.status !== "updating"
    || !card.generatedImageDataUrl
    || !card.sourceFingerprint
  ) return workspace;

  return {
    ...workspace,
    shareCard: {
      ...card,
      status: "ready" as const,
      errorMessage: "",
    },
  };
};

export const loadBeautyWorkspace = async (language: Language = "en") => {
  const workspace = await loadBeautyWorkspaceBase(language);
  const withShareCard = await loadRemoteBeautyShareCard(workspace);
  if (withShareCard.shareCard.logoImageDataUrl) return withShareCard;

  const avatarDataUrl = await loadBeautyProfileAvatarDataUrl().catch(() => "");
  if (!avatarDataUrl) return withShareCard;

  return {
    ...withShareCard,
    shareCard: {
      ...withShareCard.shareCard,
      logoImageDataUrl: avatarDataUrl,
      ...(withShareCard.shareCard.enabled
        ? { status: "updating" as const, sourceFingerprint: "", errorMessage: "" }
        : {}),
    },
  };
};

const saveBeautyWorkspaceProfileNow = async (workspace: BeautyWorkspace) => {
  await saveBeautyWorkspaceBase(workspace);
};

const saveBeautyShareCardNow = async (workspace: BeautyWorkspace) => {
  const persistedWorkspace = prepareBeautyWorkspaceForPersistence(workspace);
  const confirmsGeneratedCard = persistedWorkspace !== workspace;
  const sourceFingerprint = workspace.shareCard.sourceFingerprint;

  try {
    await saveRemoteBeautyShareCard(persistedWorkspace);
    if (confirmsGeneratedCard) {
      await saveLocalBeautyWorkspace(persistedWorkspace);
      dispatchBeautyShareCardPersistence({ sourceFingerprint, status: "ready", errorMessage: "" });
    }
  } catch (error) {
    if (confirmsGeneratedCard) {
      const errorMessage = error instanceof Error ? error.message : "beauty_share_card_save_failed";
      const failedWorkspace: BeautyWorkspace = {
        ...workspace,
        shareCard: { ...workspace.shareCard, status: "error", errorMessage },
      };
      await saveLocalBeautyWorkspace(failedWorkspace).catch(() => undefined);
      dispatchBeautyShareCardPersistence({ sourceFingerprint, status: "error", errorMessage });
    }
    throw error;
  }
};

const enqueueBeautyWorkspaceProfileSave = createBeautyWorkspaceSaveQueue(saveBeautyWorkspaceProfileNow);
const enqueueBeautyShareCardSave = createBeautyWorkspaceSaveQueue(saveBeautyShareCardNow);

export const saveBeautyWorkspaceProfile = (workspace: BeautyWorkspace) =>
  enqueueBeautyWorkspaceProfileSave(workspace);

export const saveBeautyShareCard = (workspace: BeautyWorkspace) =>
  enqueueBeautyShareCardSave(workspace);

export const saveBeautyWorkspace = async (workspace: BeautyWorkspace) => {
  await saveBeautyWorkspaceProfile(workspace);
  await saveBeautyShareCard(workspace).catch(() => undefined);
};

export const resetBeautyWorkspace = async () => {
  resetRemoteBeautyShareCardState();
  await resetBeautyWorkspaceBase();
};

export { updateBeautyPublicSlug };
export { beautyStorageMetadata } from "./beautyWorkspaceLocalStorage";
