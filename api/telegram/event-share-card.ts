import { readEnv } from "../_shared/env.js";
import { renderTelegramActivityShareCardJpeg } from "../_shared/telegram-activity-share-card-image.js";
import { readTelegramShareCardToken } from "../_shared/telegram-share-card-token.js";

type VercelRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  end(body?: string | Uint8Array): void;
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).end("method_not_allowed");
  }

  const secret = readEnv("TELEGRAM_BOT_TOKEN");
  const rawToken = request.query?.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (!secret || !token || token.length > 8_000) return response.status(404).end("not_found");

  const card = readTelegramShareCardToken(token, secret);
  if (!card) return response.status(404).end("not_found");

  try {
    const jpeg = await renderTelegramActivityShareCardJpeg(card);
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(jpeg.length));
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    return response.status(200).end(jpeg);
  } catch {
    return response.status(500).end("render_failed");
  }
}
