import type { JoinResult } from "../join/types.js";
import type {
  InstagramMessagePayload,
  MessengerMessagePayload,
  MetaEventSummary,
  MetaJoinResultPayload,
  MetaMessagingProvider,
  MetaQuickReply,
} from "./types.js";

const eventSummaryText = (event: MetaEventSummary) => [
  event.title,
  event.dateTime,
  event.location,
  event.availableSpots > 0 ? `Осталось мест: ${event.availableSpots}` : "Свободных мест нет",
].join("\n");

const eventQuickReplies = (eventId: string): MetaQuickReply[] => [
  { content_type: "text", title: "Присоединиться", payload: `join:${eventId}` },
  { content_type: "text", title: "Подробнее", payload: `details:${eventId}` },
];

const invitationButtonCopy = {
  ru: { join: "Присоединиться", open: "Открыть событие", calendar: "В календарь" },
  uk: { join: "Приєднатися", open: "Відкрити подію", calendar: "У календар" },
  cs: { join: "Připojit se", open: "Otevřít událost", calendar: "Do kalendáře" },
  en: { join: "Join", open: "Open event", calendar: "Add to calendar" },
  pl: { join: "Join", open: "Open event", calendar: "Add to calendar" },
  sk: { join: "Připojit se", open: "Otevřít událost", calendar: "Do kalendáře" },
} as const;

const invitationMessage = (event: MetaEventSummary) => {
  if (!event.imageUrl) {
    return {
      text: eventSummaryText(event),
      quick_replies: eventQuickReplies(event.eventId),
    };
  }

  const labels = invitationButtonCopy[event.language || "ru"];
  const buttons = [
    { type: "postback" as const, title: labels.join, payload: `join:${event.eventId}` },
    ...(event.openUrl
      ? [{ type: "web_url" as const, title: labels.open, url: event.openUrl }]
      : [{ type: "postback" as const, title: "Подробнее", payload: `details:${event.eventId}` }]),
    ...(event.calendarUrl
      ? [{ type: "web_url" as const, title: labels.calendar, url: event.calendarUrl }]
      : []),
  ];

  return {
    attachment: {
      type: "template" as const,
      payload: {
        template_type: "generic" as const,
        elements: [{
          title: event.title.slice(0, 80),
          subtitle: [event.dateTime, event.location].filter(Boolean).join(" · ").slice(0, 80),
          image_url: event.imageUrl,
          ...(event.openUrl ? { default_action: { type: "web_url" as const, url: event.openUrl } } : {}),
          buttons,
        }],
      },
    },
  };
};

const messengerEventSummaryText = (event: MetaEventSummary) => [
  event.title,
  event.dateTime,
  event.location,
  event.availableSpots > 0 ? `Осталось мест: ${event.availableSpots}` : "Свободных мест нет",
].join("\n");

const messengerEventQuickReplies = (eventId: string): MetaQuickReply[] => [
  { content_type: "text", title: "Присоединиться", payload: `join:${eventId}` },
  { content_type: "text", title: "Подробнее", payload: `details:${eventId}` },
];

export function buildInstagramInvitationPayload(
  recipientId: string,
  event: MetaEventSummary,
): InstagramMessagePayload {
  return {
    recipient: { id: recipientId },
    message: invitationMessage(event),
  };
}

export function buildMessengerInvitationPayload(
  recipientId: string,
  event: MetaEventSummary,
): MessengerMessagePayload {
  return {
    messaging_type: "RESPONSE",
    recipient: { id: recipientId },
    message: event.imageUrl
      ? invitationMessage(event)
      : {
          text: messengerEventSummaryText(event),
          quick_replies: messengerEventQuickReplies(event.eventId),
        },
  };
}

export function buildMessengerWelcomePayload(
  recipientId: string,
  appUrl: string,
): MessengerMessagePayload {
  return {
    messaging_type: "RESPONSE",
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Привет! GO IRL помогает находить события рядом и встречаться вживую. Откройте приложение, чтобы посмотреть события.",
          buttons: [{ type: "web_url", title: "Открыть GO IRL", url: appUrl }],
        },
      },
    },
  };
}

const resultHeading = (result: JoinResult) => {
  if (result.status === "joined") return "Вы присоединились к событию.";
  if (result.status === "already_joined") return "Вы уже участвуете в этом событии.";
  if (result.status === "pending") return "Заявка отправлена организатору.";
  if (result.status === "waitlisted") return "Свободных мест нет. Вы добавлены в лист ожидания.";
  if (result.reason === "event_full") return "Свободных мест нет.";
  if (result.reason === "event_closed") return "Присоединение к событию закрыто.";
  if (result.reason === "event_not_found") return "Событие не найдено.";
  return "Не удалось присоединиться к событию.";
};

const messengerResultHeading = (result: JoinResult) => {
  if (result.status === "joined") return "Вы присоединились к событию.";
  if (result.status === "already_joined") return "Вы уже участвуете в этом событии.";
  if (result.status === "pending") return "Заявка отправлена организатору.";
  if (result.status === "waitlisted") return "Свободных мест нет. Вы добавлены в лист ожидания.";
  if (result.reason === "event_full") return "Свободных мест нет.";
  if (result.reason === "event_closed") return "Присоединение к событию закрыто.";
  if (result.reason === "event_not_found") return "Событие не найдено.";
  return "Не удалось присоединиться к событию.";
};

const actionLine = (provider: MetaMessagingProvider, action: JoinResult["actions"][number]) => {
  const label = action.kind === "calendar" ? "Добавить в календарь" : "Открыть карту";
  return `${label}: ${action.url}`;
};

export function buildMetaJoinResultPayload(
  provider: MetaMessagingProvider,
  recipientId: string,
  result: JoinResult,
): MetaJoinResultPayload {
  const actionLines = result.actions.map((action) => actionLine(provider, action));
  return {
    provider,
    recipient: { id: recipientId },
    message: {
      text: [provider === "messenger" ? messengerResultHeading(result) : resultHeading(result), ...actionLines].join("\n"),
    },
    join_status: result.status,
  };
}
