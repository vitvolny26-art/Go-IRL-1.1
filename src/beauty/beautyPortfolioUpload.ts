import { profileAvatarExtension, readProfileAvatarAsDataUrl, shouldStoreProfileAvatarLocally } from "../profileAvatar";

export const beautyPortfolioMaxBytes = 8 * 1024 * 1024;
export const beautyPortfolioAcceptedTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const beautyPortfolioBucket = "beauty-share-cards";

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
  file: Pick<File, "name" | "type">,
  uniqueId: string = crypto.randomUUID(),
) {
  const safeUserKey = userKey.replace(/[^a-zA-Z0-9:_-]/g, "_");
  return `${safeUserKey}/beauty-portfolio/${uniqueId}.${profileAvatarExtension(file)}`;
}

export async function uploadBeautyPortfolioPhoto(file: File) {
  validateBeautyPortfolioFile(file);

  if (await shouldStoreProfileAvatarLocally()) {
    return readProfileAvatarAsDataUrl(file);
  }

  const { getUserKey, supabase } = await import("../supabase");
  const path = buildBeautyPortfolioPath(getUserKey(), file);
  const { error } = await supabase.storage
    .from(beautyPortfolioBucket)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;

  return supabase.storage.from(beautyPortfolioBucket).getPublicUrl(path).data.publicUrl;
}
