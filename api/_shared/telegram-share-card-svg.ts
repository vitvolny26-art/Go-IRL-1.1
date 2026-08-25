import type { TelegramEventCardInput } from "./telegram-event-card.js";

const copy = {
  ru: { free: "Бесплатно", minutes: "мин" },
  uk: { free: "Безкоштовно", minutes: "хв" },
  cs: { free: "Zdarma", minutes: "min" },
  en: { free: "Free", minutes: "min" },
} as const;

const xml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const clean = (value: string, max = 160) => value.trim().replace(/\s+/g, " ").slice(0, max);
const cleanEventText = (value: string, max = 160) => clean(
  value.replace(/^(?:\s|\u200d|\ufe0f|\p{Extended_Pictographic})+/u, ""),
  max,
);

const wrap = (value: string, maxChars: number, maxLines = 2) => {
  const words = clean(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.length > 0 ? lines[lines.length - 1] : "";
    if (!current || `${current} ${word}`.length <= maxChars) {
      if (current) lines[lines.length - 1] = `${current} ${word}`;
      else lines.push(word);
    } else if (lines.length < maxLines) {
      lines.push(word);
    } else {
      const lastLine = lines.length > 0 ? lines[lines.length - 1] : "";
      lines[lines.length - 1] = `${lastLine}…`.slice(0, maxChars);
      break;
    }
  }
  return lines.slice(0, maxLines);
};

const textLines = (lines: string[], x: number, y: number, lineHeight: number, anchor = "start") =>
  lines.map((line, index) => `<tspan x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}">${xml(line)}</tspan>`).join("");

const metricIcon = (kind: "calendar" | "ticket" | "pin", x: number, y: number) => {
  if (kind === "calendar") return `<g fill="none" stroke="#c9ff3d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="${x}" y="${y}" width="36" height="34" rx="6"/><path d="M${x} ${y + 11}h36M${x + 9} ${y - 4}v10M${x + 27} ${y - 4}v10"/></g>`;
  if (kind === "ticket") return `<g fill="none" stroke="#c9ff3d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M${x} ${y + 4}h38v9a9 9 0 0 0 0 18v9h-38v-9a9 9 0 0 0 0-18z"/><path d="M${x + 19} ${y + 6}v32" stroke-dasharray="4 7"/></g>`;
  return `<g fill="none" stroke="#c9ff3d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M${x + 18} ${y + 39}s17-17 17-28a17 17 0 1 0-34 0c0 11 17 28 17 28z"/><circle cx="${x + 18}" cy="${y + 11}" r="5"/></g>`;
};

const weatherMetricIcon = (kind: "temperature" | "rain" | "wind", x: number, y: number) => {
  if (kind === "temperature") {
    return `<g data-weather-icon="temperature" fill="none" stroke="#f5f7f8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M${x + 15} ${y + 2}v24a11 11 0 1 0 14 0V${y + 2}a7 7 0 0 0-14 0z"/><path d="M${x + 22} ${y + 14}v18"/></g>`;
  }
  if (kind === "rain") {
    return `<g data-weather-icon="rain" fill="none" stroke="#f5f7f8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M${x + 2} ${y + 17}c7-13 29-13 36 0H${x + 2}z"/><path d="M${x + 20} ${y + 17}v15c0 6 8 6 8 0"/><path d="M${x + 9} ${y + 25}l-3 7M${x + 35} ${y + 25}l-3 7"/></g>`;
  }
  return `<g data-weather-icon="wind" fill="none" stroke="#f5f7f8" stroke-width="4" stroke-linecap="round"><path d="M${x + 1} ${y + 10}h24c8 0 8-10 1-10-4 0-6 2-7 5"/><path d="M${x + 1} ${y + 21}h34c9 0 9 11 1 11-4 0-7-2-8-5"/><path d="M${x + 1} ${y + 32}h14"/></g>`;
};

const weatherBlock = (input: TelegramEventCardInput) => {
  if (!input.weather) return "";
  const weather = input.weather;
  return `<g data-weather-lines="three" font-family="DejaVu Sans, sans-serif" font-size="30" font-weight="800" fill="#f5f7f8">
    ${weatherMetricIcon("temperature", 76, 470)}
    <text x="132" y="502">${Math.round(weather.temperature)}°C</text>
    ${weatherMetricIcon("rain", 76, 525)}
    <text x="132" y="557">${Math.round(weather.rain)}%</text>
    ${weatherMetricIcon("wind", 76, 580)}
    <text x="132" y="612">${Math.round(weather.wind)} km/h</text>
  </g>`;
};

const buildShareCardSvg = (input: TelegramEventCardInput, canvasWidth = 1080, contentOffsetX = 0) => {
  const labels = copy[input.language] || copy.en;
  const headline = cleanEventText(input.activity || input.title, 80) || "GO IRL";
  const subtitle = cleanEventText(input.title, 120);
  const dateTime = [clean(input.date, 40), clean(input.time, 20)].filter(Boolean).join(" · ");
  const place = clean(input.address || input.city, 80);
  const price = input.price > 0 ? `${Math.round(input.price)} Kč` : labels.free;
  const headlineLines = wrap(headline, 18, 2);
  const subtitleLines = subtitle.toLocaleLowerCase() === headline.toLocaleLowerCase() ? [] : wrap(subtitle, 28, 4);
  const organizer = clean(input.organizer || "GO IRL", 80);
  const organizerInitial = organizer.trim().slice(0, 1).toUpperCase() || "G";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="900" viewBox="0 0 ${canvasWidth} 900">
  <defs>
    <linearGradient id="readability" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#030506" stop-opacity="0.86"/>
      <stop offset="0.46" stop-color="#030506" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#030506" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect width="${canvasWidth}" height="900" fill="url(#readability)"/>
  <rect data-card-frame="expanded" x="18" y="18" width="${canvasWidth - 36}" height="864" rx="64" fill="none" stroke="#78963a" stroke-opacity="0.42" stroke-width="3"/>

  <g transform="translate(${contentOffsetX} 0)">
    <text fill="#f7f8f9" font-size="62" font-weight="900" font-family="DejaVu Sans, sans-serif">${textLines(headlineLines, 76, 108, 64)}</text>
    <text fill="#d3d7dc" font-size="34" font-weight="600" font-family="DejaVu Sans, sans-serif">${textLines(subtitleLines, 76, 208, 42)}</text>

    ${weatherBlock(input)}

    <g data-share-footer="two-row">
      <line x1="242" y1="714" x2="242" y2="846" stroke="#f5f7f8" stroke-opacity="0.2" stroke-width="2"/>
      <line x1="510" y1="714" x2="510" y2="846" stroke="#f5f7f8" stroke-opacity="0.2" stroke-width="2"/>
      <line x1="750" y1="714" x2="750" y2="846" stroke="#f5f7f8" stroke-opacity="0.2" stroke-width="2"/>

      <rect data-organizer-avatar-slot="soft-square" x="78" y="716" width="128" height="128" rx="16" fill="#111518" fill-opacity="0.42" stroke="#c9ff3d" stroke-opacity="0.58" stroke-width="3"/>
      <text x="142" y="793" text-anchor="middle" fill="#f7f8f9" font-size="42" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(organizerInitial)}</text>

      ${metricIcon("calendar", 358, 735)}
      <text x="376" y="826" text-anchor="middle" fill="#f7f8f9" font-size="27" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(dateTime)}</text>

      ${metricIcon("ticket", 611, 735)}
      <text x="630" y="826" text-anchor="middle" fill="#f7f8f9" font-size="27" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(price)}</text>

      ${metricIcon("pin", 856, 732)}
      <text fill="#f7f8f9" font-size="24" font-weight="900" font-family="DejaVu Sans, sans-serif">${textLines(wrap(place, 20, 1), 874, 826, 30, "middle")}</text>
    </g>
  </g>
  </svg>`;
};

export const buildTelegramShareCardSvg = (input: TelegramEventCardInput) => buildShareCardSvg(input, 1200, 60);
export const buildMetaInvitationCardSvg = (input: TelegramEventCardInput) => buildShareCardSvg(input);
