import type { TelegramEventCardInput } from "./telegram-event-card.js";
import { buildTelegramCalendarUrl } from "./telegram-event-card.js";

const pad = (value: number) => String(value).padStart(2, "0");
const compactLocal = (date: string, time: string) => `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
const escapeIcs = (value: string) => value
  .replaceAll("\\", "\\\\")
  .replaceAll(";", "\\;")
  .replaceAll(",", "\\,")
  .replaceAll("\n", "\\n");

const addMinutes = (date: string, time: string, minutes: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute));
  value.setUTCMinutes(value.getUTCMinutes() + minutes);
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}00`;
};

export const buildMetaEventGoogleCalendarUrl = (
  card: TelegramEventCardInput,
  canonicalEventUrl: string,
) => buildTelegramCalendarUrl({
  ...card,
  inviteUrl: canonicalEventUrl,
});

export const buildMetaEventCalendar = (
  card: TelegramEventCardInput,
  canonicalEventUrl: string,
  now = new Date(),
) => {
  const duration = Math.min(480, Math.max(15, Math.round(card.durationMinutes || 90)));
  const detailsUrl = canonicalEventUrl;
  const start = compactLocal(card.eventDate, card.time);
  const end = addMinutes(card.eventDate, card.time, duration);
  const title = card.title || card.activity || "GO IRL";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GO IRL//Meta Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(card.eventId)}@go-irl.fun`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    `DTSTART;TZID=Europe/Prague:${start}`,
    `DTEND;TZID=Europe/Prague:${end}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(`${card.activity}\n\n${detailsUrl}`)}`,
    `LOCATION:${escapeIcs(card.address || card.city)}`,
    `URL:${escapeIcs(detailsUrl)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
};
