import { readEnv } from "../_shared/env.js";
import { readImageRenderToken } from "../_shared/image-render-token.js";
import {
  renderMetaInvitationCardJpeg,
  renderTelegramShareCardJpeg,
} from "../_shared/telegram-share-card-image.js";

type VercelRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  end(body?: string | Uint8Array): void;
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
};

const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).end("method_not_allowed");
  }

  const secret = readEnv("IMAGE_RENDER_SECRET");
  if (!secret) return response.status(503).end("render_unavailable");

  const token = firstQueryValue(request.query?.token);
  if (!token || token.length > 8_000) return response.status(404).end("not_found");
  const renderRequest = readImageRenderToken(token, secret);
  if (!renderRequest) return response.status(404).end("not_found");

  try {
    const jpeg = renderRequest.mode === "meta-event"
      ? await renderMetaInvitationCardJpeg(renderRequest.card)
      : await renderTelegramShareCardJpeg(renderRequest.card);
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(jpeg.length));
    response.setHeader(
      "Cache-Control",
      renderRequest.mode === "meta-event"
        ? "public, max-age=86400, immutable"
        : "private, max-age=60",
    );
    return response.status(200).end(jpeg);
  } catch {
    console.warn("image_render_failed", { mode: renderRequest.mode });
    return response.status(500).end("render_failed");
  }
}
