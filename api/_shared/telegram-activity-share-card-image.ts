import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { renderTelegramShareCardJpeg } from "./telegram-share-card-image.js";

export const TELEGRAM_ACTIVITY_SHARE_WIDTH = 1200;
export const TELEGRAM_ACTIVITY_SHARE_HEIGHT = 900;

export const renderTelegramActivityShareCardJpeg = (input: TelegramEventCardInput) =>
  renderTelegramShareCardJpeg(input);
