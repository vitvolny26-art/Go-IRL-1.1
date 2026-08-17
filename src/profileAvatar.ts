import { isBrowserMockMode, isLegacyDemoAuthEnabled } from "./authSession";
import { getUserKey, supabase } from "./supabase";

export const profileAvatarBucket = "avatars";

const imageMimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const isDataImageAvatar = (value: string) => value.startsWith("data:image/");

export async function shouldStoreProfileAvatarLocally() {
  return isBrowserMockMode() || isLegacyDemoAuthEnabled();
}

export const profileAvatarExtension = (file: Pick<File, "name" | "type">) => {
  const mimeExtension = imageMimeExtensions[file.type];
  if (mimeExtension) return mimeExtension;

  const hasExtension = file.name.includes(".");
  const extension = hasExtension
    ? file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";

  return extension || "jpg";
};

export const buildProfileAvatarPath = (
  userKey: string,
  file: Pick<File, "name" | "type">,
  uniqueId: string = crypto.randomUUID(),
) => {
  const safeUserKey = userKey.replace(/[^a-zA-Z0-9:_-]/g, "_");
  return `${safeUserKey}/${uniqueId}.${profileAvatarExtension(file)}`;
};

export const readProfileAvatarAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("avatar_read_failed"));
  reader.onload = () => resolve(String(reader.result || ""));
  reader.readAsDataURL(file);
});

export async function uploadProfileAvatarToStorage(file: File) {
  const path = buildProfileAvatarPath(getUserKey(), file);
  const { error } = await supabase.storage
    .from(profileAvatarBucket)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || "image/jpeg",
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(profileAvatarBucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function resolveProfileAvatarUpload(file: File) {
  if (await shouldStoreProfileAvatarLocally()) {
    return readProfileAvatarAsDataUrl(file);
  }

  return uploadProfileAvatarToStorage(file);
}
