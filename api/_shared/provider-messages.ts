import { request as nodeHttpsRequest } from "node:https";
import type { JoinResult } from "../../src/join/types.js";
import {
  buildInstagramInvitationPayload,
  buildMessengerInvitationPayload,
  buildMessengerWelcomePayload,
  buildMetaJoinResultPayload,
} from "../../src/meta-messaging/payload-builders.js";
import type { MetaEventSummary, MetaMessagingProvider } from "../../src/meta-messaging/types.js";
import {
  buildWhatsAppInvitationPayload,
  buildWhatsAppJoinResultPayload,
} from "../../src/whatsapp/payload-builders.js";
import { readEnv, requireEnv } from "./env.js";
import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { createMetaInvitationCardToken } from "./telegram-share-card-token.js";

export type MessagingProvider = "whatsapp" | MetaMessagingProvider;

const graphUrl = (path: string) =>
  `https://graph.facebook.com/${requireEnv("META_GRAPH_VERSION")}/${path}`;

const instagramMessagesUrl = () => readEnv("INSTAGRAM_API_MODE") === "instagram_login"
  ? `https://graph.instagram.com/${requireEnv("META_GRAPH_VERSION")}/me/messages`
  : graphUrl(`${requireEnv("INSTAGRAM_ACCOUNT_ID")}/messages`);

const safeTransportCode = (error: unknown) => {
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];
  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
    seen.add(candidate);
    const record = candidate as { cause?: unknown; code?: unknown; errors?: unknown };
    if (typeof record.code === "string") {
      const code = record.code.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
      if (code) return code;
    }
    if (record.cause) queue.push(record.cause);
    if (Array.isArray(record.errors)) queue.push(...record.errors.slice(0, 5));
  }
  return "unknown";
};

type GraphResponse = Pick<Response, "ok" | "status" | "text">;

const postViaNodeHttps = (
  url: string,
  token: string,
  body: string,
): Promise<GraphResponse> => new Promise((resolve, reject) => {
  const request = nodeHttpsRequest(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    },
  }, (response) => {
    let responseBody = "";
    response.setEncoding("utf8");
    response.on("data", (chunk: string) => {
      responseBody += chunk;
    });
    response.on("end", () => {
      const status = response.statusCode ?? 0;
      resolve({
        ok: status >= 200 && status < 300,
        status,
        text: async () => responseBody,
      });
    });
  });
  request.on("error", reject);
  request.end(body);
});

async function sendGraphPayload(url: string, token: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const accessToken = token.replace(/[^\x21-\x7E]/g, "");
  if (!accessToken) throw new Error("meta_access_token_invalid");
  let response: GraphResponse;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body,
    });
  } catch {
    try {
      response = await postViaNodeHttps(url, accessToken, body);
    } catch (error) {
      throw Object.assign(
        new Error(`meta_transport_failed:${safeTransportCode(error)}`),
        { cause: error },
      );
    }
  }
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`meta_send_failed:${response.status}:${errorText.slice(0, 300)}`);
  }
}

const publicOrigin = () => {
  const explicitOrigin = readEnv("GO_IRL_PUBLIC_ORIGIN");
  const host = explicitOrigin || (readEnv("VERCEL_ENV") === "preview"
    ? readEnv("VERCEL_URL") || readEnv("VERCEL_PROJECT_PRODUCTION_URL")
    : readEnv("VERCEL_PROJECT_PRODUCTION_URL") || readEnv("VERCEL_URL"));
  if (!host) return "";
  try {
    const url = new URL(host.startsWith("http") ? host : `https://${host}`);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
};

const invitationCardInput = (event: MetaEventSummary): TelegramEventCardInput => ({
  eventId: event.eventId,
  title: event.title,
  activity: event.activity || event.title,
  date: event.date || event.dateTime,
  eventDate: event.eventDate || event.date || "",
  time: event.time || "",
  address: event.location,
  participants: event.participants ?? Math.max((event.capacity || 0) - event.availableSpots, 0),
  capacity: event.capacity ?? event.availableSpots,
  icon: event.icon || "✨",
  inviteUrl: event.inviteUrl || "",
  mapUrl: event.mapUrl,
  city: event.city || event.location,
  durationMinutes: event.durationMinutes,
  price: event.price || 0,
  level: event.level || "Для всех",
  format: event.format || "Открыто",
  environment: event.environment || "В городе",
  isSport: event.isSport,
  weather: event.weather,
  language: event.language || "ru",
});

const withInvitationPresentation = (provider: MessagingProvider, event: MetaEventSummary): MetaEventSummary => {
  const origin = publicOrigin();
  const language = event.language || "ru";
  const eventQuery = `event=${encodeURIComponent(event.eventId)}&language=${encodeURIComponent(language)}`;
  const openUrl = event.openUrl || (origin
    ? `${origin}/api/meta/event-preview?${eventQuery}`
    : event.inviteUrl);
  const calendarUrl = event.calendarUrl || (origin
    ? `${origin}/api/meta/event-preview?${eventQuery}&format=ics`
    : undefined);
  const cardInput = invitationCardInput({ ...event, inviteUrl: openUrl || event.inviteUrl });
  const secret = provider === "instagram"
    ? readEnv("INSTAGRAM_APP_SECRET") || readEnv("META_APP_SECRET")
    : readEnv("META_APP_SECRET");
  if (event.imageUrl || !origin || !secret) return { ...event, openUrl, calendarUrl };
  const token = createMetaInvitationCardToken(cardInput, secret);
  return {
    ...event,
    openUrl,
    calendarUrl,
    imageUrl: `${origin}/api/meta/event-invitation-card?token=${encodeURIComponent(token)}&v=6`,
  };
};

export async function sendProviderInvitation(
  provider: MessagingProvider,
  recipientId: string,
  event: MetaEventSummary,
) {
  const invitation = withInvitationPresentation(provider, event);
  if (provider === "whatsapp") {
    return sendGraphPayload(
      graphUrl(`${requireEnv("WHATSAPP_PHONE_NUMBER_ID")}/messages`),
      requireEnv("WHATSAPP_ACCESS_TOKEN"),
      buildWhatsAppInvitationPayload(recipientId, invitation),
    );
  }
  if (provider === "instagram") {
    return sendGraphPayload(
      instagramMessagesUrl(),
      requireEnv("INSTAGRAM_ACCESS_TOKEN"),
      buildInstagramInvitationPayload(recipientId, invitation),
    );
  }
  return sendGraphPayload(
    graphUrl(`${requireEnv("MESSENGER_PAGE_ID")}/messages`),
    requireEnv("MESSENGER_PAGE_ACCESS_TOKEN"),
    buildMessengerInvitationPayload(recipientId, invitation),
  );
}

export async function sendProviderJoinResult(
  provider: MessagingProvider,
  recipientId: string,
  result: JoinResult,
) {
  if (provider === "whatsapp") {
    const built = buildWhatsAppJoinResultPayload(recipientId, result);
    const { join_status: _joinStatus, ...payload } = built;
    void _joinStatus;
    return sendGraphPayload(
      graphUrl(`${requireEnv("WHATSAPP_PHONE_NUMBER_ID")}/messages`),
      requireEnv("WHATSAPP_ACCESS_TOKEN"),
      payload,
    );
  }

  const built = buildMetaJoinResultPayload(provider, recipientId, result);
  const payload = provider === "messenger"
    ? { messaging_type: "RESPONSE", recipient: built.recipient, message: built.message }
    : { recipient: built.recipient, message: built.message };
  return sendGraphPayload(
    provider === "instagram" ? instagramMessagesUrl() : graphUrl(`${requireEnv("MESSENGER_PAGE_ID")}/messages`),
    provider === "instagram" ? requireEnv("INSTAGRAM_ACCESS_TOKEN") : requireEnv("MESSENGER_PAGE_ACCESS_TOKEN"),
    payload,
  );
}

export async function sendMessengerWelcome(recipientId: string) {
  const origin = publicOrigin();
  if (!origin) throw new Error("messenger_public_origin_missing");
  return sendGraphPayload(
    graphUrl(`${requireEnv("MESSENGER_PAGE_ID")}/messages`),
    requireEnv("MESSENGER_PAGE_ACCESS_TOKEN"),
    buildMessengerWelcomePayload(recipientId, origin),
  );
}

export async function sendProviderText(
  provider: MessagingProvider,
  recipientId: string,
  text: string,
) {
  if (provider === "whatsapp") {
    return sendGraphPayload(
      graphUrl(`${requireEnv("WHATSAPP_PHONE_NUMBER_ID")}/messages`),
      requireEnv("WHATSAPP_ACCESS_TOKEN"),
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientId,
        type: "text",
        text: { body: text },
      },
    );
  }
  const payload = provider === "messenger"
    ? { messaging_type: "RESPONSE", recipient: { id: recipientId }, message: { text } }
    : { recipient: { id: recipientId }, message: { text } };
  return sendGraphPayload(
    provider === "instagram"
      ? instagramMessagesUrl()
      : graphUrl(`${requireEnv("MESSENGER_PAGE_ID")}/messages`),
    provider === "instagram"
      ? requireEnv("INSTAGRAM_ACCESS_TOKEN")
      : requireEnv("MESSENGER_PAGE_ACCESS_TOKEN"),
    payload,
  );
}
