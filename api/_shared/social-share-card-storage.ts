import { createClient } from "@supabase/supabase-js";
import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { readEnv } from "./env.js";
import { renderSocialShareVariants, socialShareVariants, type SocialShareKind } from "./social-share-card-image.js";

export const SOCIAL_SHARE_BUCKET = "activity-share-cards";
export const socialShareLanguages = ["ru", "uk", "cs", "en"] as const;
export type SocialShareLanguage = (typeof socialShareLanguages)[number];

const storageClient = () => {
  const url = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("social_share_storage_not_configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

export const socialShareObjectPath = (
  kind: SocialShareKind,
  ownerId: string,
  variant: (typeof socialShareVariants)[number],
  language: SocialShareLanguage,
) => `social/${kind}/${ownerId}/${variant}/${language}.jpg`;

export const persistSocialShareVariants = async (
  input: TelegramEventCardInput,
  kind: SocialShareKind,
  ownerId: string,
) => {
  const rendered = await renderSocialShareVariants(input, kind);
  const bucket = storageClient().storage.from(SOCIAL_SHARE_BUCKET);
  await Promise.all(socialShareVariants.map(async (variant) => {
    const result = await bucket.upload(
      socialShareObjectPath(kind, ownerId, variant, input.language as SocialShareLanguage),
      rendered[variant],
      { cacheControl: "3600", contentType: "image/jpeg", upsert: true },
    );
    if (result.error) throw result.error;
  }));
};
