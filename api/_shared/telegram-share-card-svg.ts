import type { TelegramEventCardInput } from "./telegram-event-card.js";

const copy = {
  ru: { free: "Бесплатно", minutes: "мин" },
  uk: { free: "Безкоштовно", minutes: "хв" },
  cs: { free: "Zdarma", minutes: "min" },
  en: { free: "Free", minutes: "min" },
} as const;

export const SPORT_SHARE_AVATAR_LEFT = 34;

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

const estimateTextWidth = (value: string, fontSize: number) =>
  Array.from(value).reduce((width, character) => {
    if (/\s/u.test(character)) return width + fontSize * 0.32;
    if ("ilI1|.,:;!'`".includes(character)) return width + fontSize * 0.32;
    if ("mwMW@%&ЖШЩЮ".includes(character)) return width + fontSize * 0.82;
    return width + fontSize * 0.58;
  }, 0);

const fitTextToWidth = (value: string, maxWidth: number, fontSize: number) => {
  const normalized = clean(value);
  if (estimateTextWidth(normalized, fontSize) <= maxWidth) return normalized;
  let fitted = normalized;
  while (fitted && estimateTextWidth(`${fitted}…`, fontSize) > maxWidth) fitted = fitted.slice(0, -1);
  return fitted ? `${fitted.trimEnd()}…` : "";
};

const divider = (x: number) =>
  `<line x1="${x}" y1="714" x2="${x}" y2="846" stroke="#f5f7f8" stroke-opacity="0.2" stroke-width="2"/>`;

const buildLegacyMetricFooterSvg = (
  organizerInitial: string,
  dateTime: string,
  price: string,
  place: string,
) => `
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
    </g>`;

type SportFooterLayout = "inline" | "stacked";

const telegramSportType = {
  headline: 81,
  headlineLineHeight: 84,
  subtitle: 41,
  subtitleLineHeight: 50,
  avatar: 50,
  metric: 32,
  location: 29,
} as const;

const buildSportFooterSvg = (
  canvasWidth: number,
  organizerInitial: string,
  dateTime: string,
  price: string,
  place: string,
  layout: SportFooterLayout = "inline",
) => {
  const isStacked = layout === "stacked";
  const metricFontSize = isStacked ? telegramSportType.metric : 27;
  const locationFontSize = isStacked ? telegramSportType.location : 24;
  const avatarFontSize = isStacked ? telegramSportType.avatar : 42;
  const footerRight = canvasWidth - SPORT_SHARE_AVATAR_LEFT;
  const avatarDivider = SPORT_SHARE_AVATAR_LEFT + 128 + 18;
  const dateStart = avatarDivider + 24;
  const dateLabel = fitTextToWidth(dateTime, 250, metricFontSize);
  const dateWidth = Math.max(56, Math.ceil(estimateTextWidth(dateLabel, metricFontSize)));
  const dateDivider = dateStart + 44 + 14 + dateWidth + 22;
  const priceStart = dateDivider + 24;
  const priceLabel = fitTextToWidth(price, 140, metricFontSize);
  const priceWidth = Math.max(56, Math.ceil(estimateTextWidth(priceLabel, metricFontSize)));
  const priceDivider = priceStart + 44 + 14 + priceWidth + 22;
  const locationStart = priceDivider + 24;
  const locationTextX = locationStart + 52;
  const locationWidth = Math.max(0, footerRight - locationTextX);
  const inlinePlaceLabel = fitTextToWidth(place, locationWidth, locationFontSize);
  const stackedPlaceLabel = fitTextToWidth(place, Math.max(0, footerRight - priceDivider - 48), locationFontSize);
  const avatarCenter = SPORT_SHARE_AVATAR_LEFT + 64;
  const dateCenter = Math.round((avatarDivider + dateDivider) / 2);
  const priceCenter = Math.round((dateDivider + priceDivider) / 2);
  const locationCenter = Math.round((priceDivider + footerRight) / 2);
  const metrics = layout === "stacked"
    ? `
      <g data-share-metric="date" data-cell-center="${dateCenter}">
        ${metricIcon("calendar", dateCenter - 18, 735)}
        <text x="${dateCenter}" y="826" text-anchor="middle" fill="#f7f8f9" font-size="${metricFontSize}" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(dateLabel)}</text>
      </g>

      <g data-share-metric="price" data-cell-center="${priceCenter}">
        ${metricIcon("ticket", priceCenter - 19, 735)}
        <text x="${priceCenter}" y="826" text-anchor="middle" fill="#f7f8f9" font-size="${metricFontSize}" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(priceLabel)}</text>
      </g>

      <g data-share-metric="location" data-cell-center="${locationCenter}">
        ${metricIcon("pin", locationCenter - 18, 732)}
        <text x="${locationCenter}" y="826" text-anchor="middle" fill="#f7f8f9" font-size="${locationFontSize}" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(stackedPlaceLabel)}</text>
      </g>`
    : `
      <g data-share-metric="date">
        ${metricIcon("calendar", dateStart, 756)}
        <text x="${dateStart + 52}" y="792" fill="#f7f8f9" font-size="27" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(dateLabel)}</text>
      </g>

      <g data-share-metric="price">
        ${metricIcon("ticket", priceStart, 756)}
        <text x="${priceStart + 52}" y="792" fill="#f7f8f9" font-size="27" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(priceLabel)}</text>
      </g>

      <g data-share-metric="location">
        ${metricIcon("pin", locationStart, 753)}
        <text x="${locationTextX}" y="792" fill="#f7f8f9" font-size="24" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(inlinePlaceLabel)}</text>
      </g>`;
  return `<g data-share-footer="sport-content-width" data-layout="${layout}" data-avatar-left="${SPORT_SHARE_AVATAR_LEFT}" data-date-divider="${dateDivider}" data-price-divider="${priceDivider}">
      ${divider(avatarDivider)}
      ${divider(dateDivider)}
      ${divider(priceDivider)}

      <rect data-organizer-avatar-slot="soft-square" x="${SPORT_SHARE_AVATAR_LEFT}" y="716" width="128" height="128" rx="16" fill="#111518" fill-opacity="0.42" stroke="#c9ff3d" stroke-opacity="0.58" stroke-width="3"/>
      <text x="${avatarCenter}" y="793" text-anchor="middle" fill="#f7f8f9" font-size="${avatarFontSize}" font-weight="900" font-family="DejaVu Sans, sans-serif">${xml(organizerInitial)}</text>

      ${metrics}
    </g>`;
};

const buildShareCardSvg = (input: TelegramEventCardInput, canvasWidth = 1080, contentOffsetX = 0, sportFooterLayout: SportFooterLayout = "inline") => {
  const labels = copy[input.language] || copy.en;
  const headline = cleanEventText(input.activity || input.title, 80) || "GO IRL";
  const subtitle = cleanEventText(input.isSport ? (input.description || input.title) : input.title, 160);
  const dateTime = [clean(input.date, 40), clean(input.time, 20)].filter(Boolean).join(" · ");
  const place = clean(input.address || input.city, 80);
  const price = input.price > 0 ? `${Math.round(input.price)} Kč` : labels.free;
  const headlineLines = wrap(headline, 18, 2);
  const subtitleLines = subtitle.toLocaleLowerCase() === headline.toLocaleLowerCase()
    ? []
    : wrap(subtitle, input.isSport ? 34 : 28, input.isSport ? 2 : 4);
  const organizer = clean(input.organizer || "GO IRL", 80);
  const organizerInitial = organizer.trim().slice(0, 1).toUpperCase() || "G";
  const isTelegramSport = input.isSport && sportFooterLayout === "stacked";
  const headlineFontSize = isTelegramSport ? telegramSportType.headline : 62;
  const headlineLineHeight = isTelegramSport ? telegramSportType.headlineLineHeight : 64;
  const subtitleFontSize = isTelegramSport ? telegramSportType.subtitle : 34;
  const subtitleLineHeight = isTelegramSport ? telegramSportType.subtitleLineHeight : 42;
  const subtitleY = isTelegramSport && headlineLines.length > 1 ? 238 : 208;
  const footer = input.isSport
    ? buildSportFooterSvg(canvasWidth, organizerInitial, dateTime, price, place, sportFooterLayout)
    : buildLegacyMetricFooterSvg(organizerInitial, dateTime, price, place);

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
    <text data-share-headline="true" fill="#f7f8f9" font-size="${headlineFontSize}" font-weight="900" font-family="DejaVu Sans, sans-serif">${textLines(headlineLines, 76, 108, headlineLineHeight)}</text>
    <text data-share-subtitle="true" fill="#d3d7dc" font-size="${subtitleFontSize}" font-weight="600" font-family="DejaVu Sans, sans-serif">${textLines(subtitleLines, 76, subtitleY, subtitleLineHeight)}</text>
    ${input.isSport ? "" : footer}
  </g>
  ${input.isSport ? footer : ""}
  </svg>`;
};

export const buildTelegramShareCardSvg = (input: TelegramEventCardInput) => buildShareCardSvg(input, 1200, 60, "stacked");
export const buildMetaInvitationCardSvg = (input: TelegramEventCardInput) => buildShareCardSvg(input);
