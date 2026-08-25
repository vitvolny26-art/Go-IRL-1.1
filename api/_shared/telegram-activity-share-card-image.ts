import sharp from "sharp";
import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { renderTelegramShareCardJpeg } from "./telegram-share-card-image.js";

export const TELEGRAM_ACTIVITY_SHARE_WIDTH = 1200;
export const TELEGRAM_ACTIVITY_SHARE_HEIGHT = 900;

export const renderTelegramActivityShareCardJpeg = async (input: TelegramEventCardInput) => {
  const source = await renderTelegramShareCardJpeg(input);
  return sharp(source)
    .resize(TELEGRAM_ACTIVITY_SHARE_WIDTH, TELEGRAM_ACTIVITY_SHARE_HEIGHT, { fit: "fill" })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
};
