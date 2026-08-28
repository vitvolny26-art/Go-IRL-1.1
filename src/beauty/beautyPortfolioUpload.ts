import { readProfileAvatarAsDataUrl, shouldStoreProfileAvatarLocally } from "../profileAvatar";

export const beautyPortfolioMaxBytes = 8 * 1024 * 1024;
export const beautyPortfolioAcceptedTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const beautyPortfolioBucket = "beauty-share-cards";
export const beautyPortfolioStoredContentType = "image/jpeg";

export function validateBeautyPortfolioFile(file: Pick<File, "size" | "type">) {
  if (!beautyPortfolioAcceptedTypes.includes(file.type as (typeof beautyPortfolioAcceptedTypes)[number])) {
    throw new Error("beauty_portfolio_unsupported_type");
  }
  if (file.size > beautyPortfolioMaxBytes) {
    throw new Error("beauty_portfolio_file_too_large");
  }
}

export function buildBeautyPortfolioPath(
  userKey: string,
  _file: Pick<File, "name" | "type">,
  uniqueId: string = crypto.randomUUID(),
) {
  const safeUserKey = userKey.replace(/[^a-zA-Z0-9:_-]/g, "_");
  return `${safeUserKey}/beauty-portfolio/${uniqueId}.jpg`;
}

const normalizeBeautyPortfolioPhoto = async (file: File): Promise<File> => {
  if (file.type === beautyPortfolioStoredContentType) {
    return new File([file], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: beautyPortfolioStoredContentType,
      lastModified: file.lastModified,
    });
  }
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    throw new Error("beauty_portfolio_normalization_unavailable");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 2560;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("beauty_portfolio_normalization_unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("beauty_portfolio_normalization_failed")),
      beautyPortfolioStoredContentType,
      0.9,
    ));
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: beautyPortfolioStoredContentType,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
};

export async function uploadBeautyPortfolioPhoto(file: File) {
  validateBeautyPortfolioFile(file);
  const normalizedFile = await normalizeBeautyPortfolioPhoto(file);

  if (await shouldStoreProfileAvatarLocally()) {
    return readProfileAvatarAsDataUrl(normalizedFile);
  }

  const { getUserKey, supabase } = await import("../supabase");
  const path = buildBeautyPortfolioPath(getUserKey(), normalizedFile);
  const { error } = await supabase.storage
    .from(beautyPortfolioBucket)
    .upload(path, normalizedFile, {
      cacheControl: "3600",
      contentType: beautyPortfolioStoredContentType,
      upsert: false,
    });

  if (error) throw error;

  return supabase.storage.from(beautyPortfolioBucket).getPublicUrl(path).data.publicUrl;
}
