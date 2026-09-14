import type { JoinResult } from "../join/types.js";
import type {
  WhatsAppButtonPayload,
  WhatsAppEventSummary,
  WhatsAppFlowPayload,
  WhatsAppJoinResultPayload,
} from "./types.js";

const eventSummaryText = (event: WhatsAppEventSummary) => [
  event.title,
  event.dateTime,
  event.location,
  event.availableSpots > 0 ? `Available spots: ${event.availableSpots}` : "Event is full",
].join("\n");

const buttonCopy = {
  ru: { join: "Присоединиться", details: "Подробнее" },
  uk: { join: "Приєднатися", details: "Докладніше" },
  cs: { join: "Připojit se", details: "Podrobnosti" },
  en: { join: "Join", details: "Details" },
  pl: { join: "Join", details: "Details" },
  sk: { join: "Připojit se", details: "Podrobnosti" },
} as const;

export function buildWhatsAppInvitationPayload(to: string, event: WhatsAppEventSummary): WhatsAppButtonPayload {
  const labels = buttonCopy[event.language || "en"];
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(event.imageUrl ? { header: { type: "image" as const, image: { link: event.imageUrl } } } : {}),
      body: { text: eventSummaryText(event) },
      action: {
        buttons: [
          { type: "reply", reply: { id: `join:${event.eventId}`, title: labels.join } },
          { type: "reply", reply: { id: `details:${event.eventId}`, title: labels.details } },
        ],
      },
    },
  };
}

export function buildWhatsAppJoinFlowPayload(
  to: string,
  event: WhatsAppEventSummary,
  flow: { id: string; token: string },
): WhatsAppFlowPayload {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: `Confirm your place at ${event.title}.` },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: flow.id,
          flow_token: flow.token,
          flow_cta: "Confirm",
          flow_action: "navigate",
          flow_action_payload: { screen: "JOIN_EVENT", data: event },
        },
      },
    },
  };
}

const resultHeading = (result: JoinResult) => {
  if (result.status === "joined") return "You joined the event.";
  if (result.status === "already_joined") return "You are already joining this event.";
  if (result.status === "pending") return "Your join request was sent to the organizer.";
  if (result.status === "waitlisted") return "The event is full. You are on the waitlist.";
  if (result.reason === "event_full") return "The event is full.";
  if (result.reason === "event_closed") return "Joining is closed.";
  if (result.reason === "event_not_found") return "The event was not found.";
  return "You cannot join this event.";
};

export function buildWhatsAppJoinResultPayload(to: string, result: JoinResult): WhatsAppJoinResultPayload {
  const actionLines = result.actions.map((action) => `${action.label}: ${action.url}`);
  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: [resultHeading(result), ...actionLines].join("\n") },
    join_status: result.status,
  };
}
