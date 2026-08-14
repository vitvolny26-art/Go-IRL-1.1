import { isValidBeautyPublicSlug } from "./beauty/beautyPublicSlug";
import { getTelegramInitData, getTelegramWebApp } from "./telegram";
import type { Language } from "./types";
import type { PreparedTelegramShareResult } from "./telegramPreparedShare";

export const preparedTelegramBeautyShareEndpoint = "https://go-irl-1-1.vercel.app/api/telegram/prepared-beauty-share";

const beautySlugFromUrl = (value: string) => {
  try {
    const origin = typeof window === "undefined"
      ? "https://go-irl-1-0.vercel.app"
      : window.location.origin;
    const pathname = new URL(value, origin).pathname;
    const match = pathname.match(/^\/beauty\/([^/?#]+)\/?$/i);
    const slug = String(match?.[1] ? decodeURIComponent(match[1]) : "").trim().toLowerCase();
    return isValidBeautyPublicSlug(slug) ? slug : "";
  } catch {
    return "";
  }
};

const dateParts = (value: string) => {
  const [date = "", time = ""] = value.split("·").map((part) => part.trim());
  return { date, time };
};

export const canPrepareBeautyTelegramShare = (url: string) => Boolean(beautySlugFromUrl(url));

export async function sharePreparedTelegramBeauty(
  url: string,
  dateLabel: string,
  language: Language,
): Promise<PreparedTelegramShareResult> {
  const webApp = getTelegramWebApp();
  const initData = getTelegramInitData();
  const slug = beautySlugFromUrl(url);
  if (!webApp?.shareMessage || !initData || !slug) return "unavailable";

  const { date, time } = dateParts(dateLabel);
  try {
    const response = await fetch(preparedTelegramBeautyShareEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, slug, language, date, time }),
    });
    if (!response.ok) return "unavailable";

    const payload = await response.json() as { preparedMessageId?: unknown };
    const preparedMessageId = payload.preparedMessageId;
    if (typeof preparedMessageId !== "string" || !preparedMessageId) return "unavailable";

    return await new Promise<PreparedTelegramShareResult>((resolve) => {
      let settled = false;
      const finish = (result: PreparedTelegramShareResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(result);
      };
      const timeout = window.setTimeout(() => finish("unavailable"), 20_000);
      webApp.shareMessage?.(preparedMessageId, (success) => finish(success ? "shared" : "cancelled"));
    });
  } catch {
    return "unavailable";
  }
}
