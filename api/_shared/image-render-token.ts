/// <reference types="node" />
import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramEventCardInput } from "./telegram-event-card.js";

export type ImageRenderMode = "telegram-event" | "meta-event";

export type ImageRenderTokenPayload = {
  version: 1;
  mode: ImageRenderMode;
  card: TelegramEventCardInput;
  expiresAt: number;
};

const maxTokenLength = 8_000;
const maxTtlMs = 24 * 60 * 60 * 1000;
const renderModes = new Set<ImageRenderMode>(["telegram-event", "meta-event"]);
const renderLanguages = new Set(["ru", "uk", "cs", "en"]);

const signatureFor = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

const safeSignatureEqual = (actual: string, expected: string) => {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isRenderCard = (value: unknown): value is TelegramEventCardInput => {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<TelegramEventCardInput>;
  return typeof card.eventId === "string"
    && typeof card.title === "string"
    && typeof card.activity === "string"
    && typeof card.date === "string"
    && typeof card.eventDate === "string"
    && typeof card.time === "string"
    && typeof card.address === "string"
    && typeof card.icon === "string"
    && typeof card.inviteUrl === "string"
    && typeof card.city === "string"
    && typeof card.level === "string"
    && typeof card.format === "string"
    && typeof card.environment === "string"
    && isFiniteNumber(card.participants)
    && isFiniteNumber(card.capacity)
    && isFiniteNumber(card.price)
    && typeof card.language === "string"
    && renderLanguages.has(card.language);
};

export function createImageRenderToken(
  mode: ImageRenderMode,
  card: TelegramEventCardInput,
  secret: string,
  now = Date.now(),
  ttlMs = 60 * 60 * 1000,
) {
  if (!secret) throw new Error("image_render_secret_required");
  if (!renderModes.has(mode)) throw new Error("image_render_mode_invalid");
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > maxTtlMs) {
    throw new Error("image_render_ttl_invalid");
  }
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    mode,
    card,
    expiresAt: now + ttlMs,
  } satisfies ImageRenderTokenPayload)).toString("base64url");
  const token = `${payload}.${signatureFor(payload, secret)}`;
  if (token.length > maxTokenLength) throw new Error("image_render_token_too_large");
  return token;
}

export function readImageRenderToken(token: string, secret: string, now = Date.now()) {
  if (!secret || !token || token.length > maxTokenLength) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = signatureFor(payload, secret);
  if (!safeSignatureEqual(signature, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<ImageRenderTokenPayload>;
    if (parsed.version !== 1
      || typeof parsed.mode !== "string"
      || !renderModes.has(parsed.mode as ImageRenderMode)
      || !isRenderCard(parsed.card)
      || !isFiniteNumber(parsed.expiresAt)
      || parsed.expiresAt < now
      || parsed.expiresAt > now + maxTtlMs) return null;
    return parsed as ImageRenderTokenPayload;
  } catch {
    return null;
  }
}
