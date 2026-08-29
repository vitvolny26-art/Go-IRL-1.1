import type { TelegramEventCardInput } from "./telegram-event-card.js";

const copy = {
  ru: { cta: "Услуги и запись", priceFrom: "от" },
  uk: { cta: "Послуги та запис", priceFrom: "від" },
  cs: { cta: "Služby a rezervace", priceFrom: "od" },
  en: { cta: "Services and booking", priceFrom: "from" },
} as const;

const xml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const clean = (value: string, max = 140) => value.trim().replace(/\s+/g, " ").slice(0, max);

const wrap = (value: string, maxChars: number, maxLines: number) => {
  const words = clean(value, maxChars * maxLines * 2).split(" ").filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines[lines.length - 1] || "";
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      if (current) lines[lines.length - 1] = candidate;
      else lines.push(candidate);
    } else if (lines.length < maxLines) {
      lines.push(word.slice(0, maxChars));
    } else {
      const last = lines[lines.length - 1] || "";
      lines[lines.length - 1] = `${last.slice(0, Math.max(0, maxChars - 1))}…`;
      break;
    }
  }
  return lines.slice(0, maxLines);
};

const tspans = (lines: string[], x: number, startY: number, step: number, marker: string) =>
  lines.map((line, index) => `<tspan data-${marker}-line="${index + 1}" x="${x}" y="${startY + index * step}">${xml(line)}</tspan>`).join("");

const monogramFor = (value: string) => Array.from(value)
  .find((character) => /[\p{L}\p{N}]/u.test(character))
  ?.toUpperCase() || "G";

const resolveBeautyLocation = (cityValue: string, addressValue: string) => {
  const city = clean(cityValue, 32);
  const address = clean(addressValue, 48);
  if (!address) return city;
  if (!city || address.includes(",")) return address;
  if (address.toLocaleLowerCase().includes(city.toLocaleLowerCase())) return address;
  return `${city}, ${address}`;
};

type BeautyShareCardVariant = "default" | "telegram";

const buildBeautyShareCardSvgVariant = (input: TelegramEventCardInput, variant: BeautyShareCardVariant) => {
  const isTelegram = variant === "telegram";
  const labels = copy[input.language] || copy.en;
  const name = clean(input.activity || input.organizer || "GO IRL Beauty", 48);
  const description = clean(input.description || input.level || input.title, 220);
  const nameFontSize = name.length > 34 ? 62 : name.length > 24 ? 76 : 100;
  const services = (input.beautyServices?.length
    ? input.beautyServices
    : [{ name: input.title, priceCzk: input.price }])
    .filter((service) => clean(service.name))
    .slice(0, 3);
  const serviceRows = services.map((service, index) => {
    const y = 330 + index * 115;
    const serviceName = clean(service.name, 60);
    const lines = wrap(serviceName, 25, 2);
    const startY = lines.length > 1 ? y + 36 : y + 54;
    return `<g data-beauty-service-row="${index + 1}" transform="translate(80 ${y})">
      <rect width="520" height="90" rx="14" fill="#180b1f" fill-opacity=".92" stroke="url(#goldGrad)" stroke-width="2"/>
      <rect x="5" y="5" width="510" height="80" rx="10" fill="none" stroke="url(#goldGrad)" stroke-width=".8" stroke-opacity=".4"/>
      <text fill="#fff" font-family="DejaVu Serif, Georgia, serif" font-size="24" font-weight="500">${tspans(lines, 22, startY - y, 29, "beauty-service-name")}</text>
      <text x="495" y="55" text-anchor="end" fill="#e8bc59" font-family="DejaVu Serif, Georgia, serif">
        <tspan font-size="22" font-weight="700">${xml(labels.priceFrom)} </tspan><tspan font-size="30" font-weight="800">${Math.round(service.priceCzk)} Kč</tspan>
      </text>
    </g>`;
  }).join("");
  const location = resolveBeautyLocation(input.city || "", input.address || "");
  const height = isTelegram ? 900 : 1020;
  const descriptionLines = wrap(description, 48, 3);
  const monogram = monogramFor(name);
  const locationX = isTelegram ? 80 : 1006;
  const locationAnchor = isTelegram ? "start" : "end";
  const footer = isTelegram ? "" : `<g data-beauty-default-cta="true">
    <rect y="900" width="1080" height="120" fill="#0a030d"/>
    <rect x="80" y="924" width="920" height="72" rx="36" fill="url(#goldGrad)"/>
    <text x="120" y="970" fill="#180b1f" font-family="DejaVu Sans, Arial, sans-serif" font-size="31" font-weight="900">${xml(labels.cta)}</text>
    <text x="960" y="971" text-anchor="end" fill="#180b1f" font-family="DejaVu Sans, Arial, sans-serif" font-size="38" font-weight="900">→</text>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" data-beauty-template="premium-v3">
  <defs>
    <style>@font-face{font-family:"GO IRL Beauty Script Web";src:local("Segoe Script"),local("Brush Script MT"),local("Apple Chancery"),local("URW Chancery L");font-style:normal;font-weight:400}</style>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff8d6"/>
      <stop offset="25%" stop-color="#e2b453"/>
      <stop offset="50%" stop-color="#ffea9f"/>
      <stop offset="75%" stop-color="#a87122"/>
      <stop offset="100%" stop-color="#f5d685"/>
    </linearGradient>
    <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
      <feFlood flood-color="#c48528" flood-opacity=".6" result="color"/>
      <feComposite in="color" in2="blur" operator="in" result="glow"/>
      <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g data-beauty-double-frame="true" stroke="url(#goldGrad)" fill="none">
    <path d="M32 60A28 28 0 0 0 60 32H1020A28 28 0 0 0 1048 60V840A28 28 0 0 0 1020 868H60A28 28 0 0 0 32 840Z" stroke-width="2.5" stroke-opacity=".9"/>
    <path d="M42 64A22 22 0 0 0 64 42H1016A22 22 0 0 0 1038 64V836A22 22 0 0 0 1016 858H64A22 22 0 0 0 42 836Z" stroke-width="1" stroke-opacity=".45"/>
  </g>
  <g data-beauty-logo-slot="true" transform="translate(835 65)">
    <rect width="170" height="170" rx="18" fill="#180b1f" fill-opacity=".92" stroke="url(#goldGrad)" stroke-width="2.5"/>
    <rect x="6" y="6" width="158" height="158" rx="12" fill="none" stroke="url(#goldGrad)" stroke-width="1" stroke-opacity=".5"/>
    <text data-beauty-monogram="true" x="85" y="114" text-anchor="middle" fill="url(#goldGrad)" filter="url(#goldGlow)" font-family="DejaVu Serif, Georgia, serif" font-size="96" font-style="italic" font-weight="600">${xml(monogram)}</text>
  </g>
  <text data-beauty-premium-title="true" x="80" y="150" fill="#fff" font-family="GO IRL Beauty Script Web, GO IRL Beauty Script, Great Vibes, cursive" font-size="${nameFontSize}" font-weight="400" letter-spacing=".4">${xml(name)}</text>
  <text fill="#ebdbe8" font-size="26" font-family="DejaVu Serif, Georgia, serif">${tspans(descriptionLines, 80, 215, 37, "beauty-description")}</text>
  ${serviceRows}
  <g data-beauty-location="true">
    <text data-beauty-location-text="true" x="${locationX}" y="835" text-anchor="${locationAnchor}" fill="#e6d8eb" font-size="28" font-family="DejaVu Serif, Georgia, serif">${xml(location)}</text>
  </g>
  ${footer}
</svg>`;
};

export const buildBeautyShareCardSvg = (input: TelegramEventCardInput) =>
  buildBeautyShareCardSvgVariant(input, "default");

export const buildTelegramBeautyShareCardSvg = (input: TelegramEventCardInput) =>
  buildBeautyShareCardSvgVariant(input, "telegram");
