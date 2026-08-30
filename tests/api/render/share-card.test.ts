import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { TelegramEventCardInput } from "../../../api/_shared/telegram-event-card.js";
import {
  createImageRenderToken,
  readImageRenderToken,
} from "../../../api/_shared/image-render-token.js";
import handler from "../../../api/render/share-card.js";

const runtimeEnv = (globalThis as typeof globalThis & {
  process: { env: Record<string, string | undefined> };
}).process.env;

const card: TelegramEventCardInput = {
  eventId: "3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  title: "Волейбол на ZS Demlova",
  activity: "Волейбол",
  date: "19 июл",
  eventDate: "2026-07-19",
  time: "16:30",
  address: "ZS Demlova",
  participants: 2,
  capacity: 12,
  icon: "volleyball",
  inviteUrl: "https://go-irl.fun/e/3b172dd9-d5e2-4328-86a4-d4107a6359fc",
  city: "Оломоуц",
  durationMinutes: 90,
  price: 0,
  level: "Любитель",
  format: "Любительский",
  environment: "На улице",
  isSport: true,
  language: "ru",
};

const invoke = async (token: string) => {
  const headers = new Map<string, string>();
  let status = 0;
  let body: string | Uint8Array | undefined;
  const response = {
    setHeader: (name: string, value: string) => { headers.set(name, value); },
    status: (value: number) => { status = value; return response; },
    end: (value?: string | Uint8Array) => { body = value; },
  };
  await handler({ method: "GET", query: { token } }, response);
  return { headers, status, body };
};

describe("stateless image render boundary", () => {
  afterEach(() => {
    delete runtimeEnv.IMAGE_RENDER_SECRET;
  });

  it("round-trips only signed bounded render payloads", () => {
    const now = Date.UTC(2026, 7, 30, 10, 0, 0);
    const token = createImageRenderToken("telegram-event", card, "render-secret", now, 60_000);
    expect(readImageRenderToken(token, "render-secret", now + 1_000)).toMatchObject({
      version: 1,
      mode: "telegram-event",
      card: { eventId: card.eventId },
    });
    expect(readImageRenderToken(`${token}x`, "render-secret", now + 1_000)).toBeNull();
    expect(readImageRenderToken(token, "wrong-secret", now + 1_000)).toBeNull();
    expect(readImageRenderToken(token, "render-secret", now + 60_001)).toBeNull();
  });

  it("renders Telegram JPEGs without application credentials", async () => {
    runtimeEnv.IMAGE_RENDER_SECRET = "render-secret";
    const token = createImageRenderToken("telegram-event", card, "render-secret");
    const result = await invoke(token);
    expect(result.status).toBe(200);
    expect(result.headers.get("Content-Type")).toBe("image/jpeg");
    expect(result.headers.get("Cache-Control")).toBe("private, max-age=60");
    const metadata = await sharp(result.body as Uint8Array).metadata();
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(900);
  });

  it("renders Meta invitation JPEGs through the same worker", async () => {
    runtimeEnv.IMAGE_RENDER_SECRET = "render-secret";
    const token = createImageRenderToken("meta-event", card, "render-secret");
    const result = await invoke(token);
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("public, max-age=86400, immutable");
    const metadata = await sharp(result.body as Uint8Array).metadata();
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1020);
  });

  it("keeps the render endpoint free of application data access and provider secrets", () => {
    const source = readFileSync(new URL("../../../api/render/share-card.ts", import.meta.url), "utf8");
    expect(source).toContain('readEnv("IMAGE_RENDER_SECRET")');
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("TELEGRAM_BOT_TOKEN");
    expect(source).not.toContain("META_APP_SECRET");
    expect(source).not.toContain("INSTAGRAM_APP_SECRET");
    expect(source).not.toContain("loadTrustedTelegramEventCard");
    expect(source).not.toContain("freshActivityShareCardJpeg");
  });
});
