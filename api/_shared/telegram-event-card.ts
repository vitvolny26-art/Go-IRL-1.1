export type TelegramEventLanguage = "ru" | "uk" | "cs" | "en" | "pl" | "sk";
export type BeautyShareLanguage = TelegramEventLanguage;

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
  language: TelegramEventLanguage;
  beautyServices?: Array<{ name: string; priceCzk: number }>;
  publicProfileUrl?: string;
  description?: string;
};

export type TelegramBeautyCardInput = Omit<TelegramEventCardInput, "language"> & {
  language: BeautyShareLanguage;
};

const copy = {
  ru: { details: "Подробнее", join: "Участвовать" },
  uk: { details: "Докладніше", join: "Приєднатися" },
  cs: { details: "Podrobnosti", join: "Zúčastnit se" },
  en: { details: "Details", join: "Participate" },
  pl: { details: "Szczegóły", join: "Weź udział" },
  sk: { details: "Podrobnosti", join: "Zúčastniť sa" },
} as const;

const postShareCopy: Record<TelegramEventLanguage, string> = {
  ru: "Поделиться событием",
  uk: "Поділитися подією",
  cs: "Sdílet událost",
  en: "Share event",
  pl: "Udostępnij wydarzenie",
  sk: "Zdieľať udalosť",
};

const beautyCopy = {
  ru: { open: "Открыть профиль" },
  uk: { open: "Відкрити профіль" },
  cs: { open: "Otevřít profil" },
  en: { open: "Open profile" },
  pl: { open: "Otwórz profil" },
  sk: { open: "Otvoriť profil" },
} as const;

const clean = (value: string, maxLength: number) => value.trim().slice(0, maxLength);
const pad = (value: number) => String(value).padStart(2, "0");

export const appendTelegramPostShareButton = (
  replyMarkup: { inline_keyboard: Array<Array<Record<string, unknown>>> },
  language: TelegramEventLanguage,
  postUrl: string,
) => {
  const target = new URL("https://t.me/share/url");
  target.searchParams.set("url", postUrl);
  return {
    inline_keyboard: [
      ...replyMarkup.inline_keyboard,
      [{ text: postShareCopy[language] || postShareCopy.en, url: target.toString() }],
    ],
  };
};

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

export function buildTelegramBeautyCard(input: TelegramBeautyCardInput, imageUrl: string) {
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
  const description = clean(input.description || "", 500);
  const caption = [title, dateTime, address, description].filter(Boolean).join("\n").slice(0, 1024);

  return {
    type: "photo" as const,
    id: input.eventId,
    photo_url: imageUrl,
    thumbnail_url: imageUrl,
    photo_width: 1200,
    photo_height: 900,
    title: (activity || title).slice(0, 256),
    description: [dateTime, address].filter(Boolean).join(" · ").slice(0, 512),
    caption,
    reply_markup: {
      inline_keyboard: [[
        { text: labels.details, url: input.inviteUrl },
        { text: labels.join, callback_data: `join:${input.eventId}` },
      ]],
    },
  };
}
