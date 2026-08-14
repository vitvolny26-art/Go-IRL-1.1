import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { renderTelegramBeautyShareCardJpeg, renderTelegramShareCardJpeg } from "./telegram-share-card-image.js";

export const SOCIAL_SHARE_WIDTH = 1600;
export const SOCIAL_SHARE_HEIGHT = 900;
export const socialShareVariants = ["post", "story"] as const;
export type SocialShareVariant = (typeof socialShareVariants)[number];
export type SocialShareKind = "activity" | "beauty";

const layoutByVariant: Record<SocialShareVariant, { width: number; height: number }> = {
  post: { width: 1040, height: 867 },
  story: { width: 900, height: 750 },
};

const frameVariant = async (source: Buffer, kind: SocialShareKind, variant: SocialShareVariant) => {
  const sharp = (await import("sharp")).default;
  const layout = layoutByVariant[variant];
  const background = await sharp(source)
    .resize(SOCIAL_SHARE_WIDTH, SOCIAL_SHARE_HEIGHT, { fit: "cover", position: "attention" })
    .blur(26)
    .modulate({ brightness: kind === "beauty" ? 0.34 : 0.28, saturation: 0.82 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const card = await sharp(source)
    .resize(layout.width, layout.height, { fit: "fill" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const left = Math.round((SOCIAL_SHARE_WIDTH - layout.width) / 2);
  const top = Math.round((SOCIAL_SHARE_HEIGHT - layout.height) / 2);
  const accent = kind === "beauty" ? "#d9ac48" : "#c9ff3d";
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_SHARE_WIDTH}" height="${SOCIAL_SHARE_HEIGHT}"><rect x="${left - 8}" y="${top - 8}" width="${layout.width + 16}" height="${layout.height + 16}" rx="42" fill="none" stroke="${accent}" stroke-opacity=".38" stroke-width="2"/></svg>`);
  return sharp(background)
    .composite([{ input: card, left, top }, { input: frame, left: 0, top: 0 }])
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
};

export const renderSocialShareVariants = async (
  input: TelegramEventCardInput,
  kind: SocialShareKind,
): Promise<Record<SocialShareVariant, Buffer>> => {
  const source = Buffer.from(kind === "beauty"
    ? await renderTelegramBeautyShareCardJpeg(input)
    : await renderTelegramShareCardJpeg(input));
  const [post, story] = await Promise.all([
    frameVariant(source, kind, "post"),
    frameVariant(source, kind, "story"),
  ]);
  return { post, story };
};
