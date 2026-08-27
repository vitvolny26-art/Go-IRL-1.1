export type TelegramEventCardInput = {
  eventId: string;
  title: string;
  activity: string;
  date: string;
  eventDate: string;
  time: string;
  address: string;
  participants: number;
  capacity: number;
  icon: string;
  inviteUrl: string;
  mapUrl?: string;
  city: string;
  organizer?: string;
  organizerKey?: string;
  organizerAvatarUrl?: string;
  sourceUpdatedAt?: string;
  durationMinutes?: number;
  price: number;
  level: string;
  format: string;
  environment: string;
  isSport?: boolean;
  weather?: {
    icon: string;
    temperature: number;
    rain: number;
    wind: number;
  };
  language: "ru" | "uk" | "cs" | "en";
  beautyServices?: Array<{ name: string; priceCzk: number }>;
  publicProfileUrl?: string;
  description?: string;
};

const copy = {
  ru: { open: "Открыть событие" },
  uk: { open: "Відкрити подію" },
  cs: { open: "Otevřít událost" },
  en: { open: "Open event" },
} as const;

const beautyCopy = {
  ru: { open: "Открыть профиль" },
  uk: { open: "Відкрити профіль" },
  cs: { open: "Otevřít profil" },
  en: { open: "Open profile" },
} as const;

const clean = (value: string, maxLength: number) => value.trim().slice(0, maxLength);
const pad = (value: number) => String(value).padStart(2, "0");

const compactGoogleDateTime = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;

export const buildTelegramCalendarUrl = (input: TelegramEventCardInput) => {
  if (!input.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate) || !/^\d{2}:\d{2}$/.test(input.time)) {
    return undefined;
  }

  const [year, month, day] = input.eventDate.split("-").map(Number);
  const [hour, minute] = input.time.split(":").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  if (Number.isNaN(start.getTime())
    || start.getUTCFullYear() !== year
    || start.getUTCMonth() !== month - 1
    || start.getUTCDate() !== day
    || start.getUTCHours() !== hour
    || start.getUTCMinutes() !== minute) return undefined;

  const durationMinutes = Math.min(480, Math.max(15, Math.round(input.durationMinutes || 90)));
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const location = [clean(input.address, 180), clean(input.city, 80)].filter(Boolean).join(", ");
  const details = [input.activity, input.inviteUrl].filter(Boolean).join("\n\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: clean(input.title || input.activity || "GO IRL", 120),
    dates: `${compactGoogleDateTime(start)}/${compactGoogleDateTime(end)}`,
    details,
    location,
    ctz: "Europe/Prague",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export function buildTelegramBeautyCard(input: TelegramEventCardInput, imageUrl: string) {
  const labels = beautyCopy[input.language] || beautyCopy.en;
  return {
    type: "photo" as const,
    id: input.eventId.slice(0, 64),
    photo_url: imageUrl,
    thumbnail_url: imageUrl,
    photo_width: 1080,
    photo_height: 900,
    caption: "",
    reply_markup: {
      inline_keyboard: [[{ text: labels.open, url: input.inviteUrl }]],
    },
  };
}

export function buildTelegramEventCard(input: TelegramEventCardInput, imageUrl: string) {
  const labels = copy[input.language] || copy.en;
  const activity = clean(input.activity, 120);
  const title = clean(input.title, 120) || activity || "GO IRL";
  const dateTime = [clean(input.date, 40), clean(input.time, 12)].filter(Boolean).join(" · ");
  const address = clean(input.address, 180);
  const buttons: Array<{ text: string; url: string }> = [{ text: labels.open, url: input.inviteUrl }];

  return {
    type: "photo" as const,
    id: input.eventId,
    photo_url: imageUrl,
    thumbnail_url: imageUrl,
    photo_width: 1200,
    photo_height: 900,
    title: (activity || title).slice(0, 256),
    description: [dateTime, address].filter(Boolean).join(" · ").slice(0, 512),
    caption: "",
    reply_markup: {
      inline_keyboard: [buttons],
    },
  };
}
