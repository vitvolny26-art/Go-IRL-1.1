import { readFileSync } from "node:fs";
import sharp from "sharp";
import { cityPostersSportTeamInitials } from "./city-posters-sport-team-emblems.js";

export type CityPostersSportType = "football" | "ice_hockey" | "basketball" | "volleyball" | "rugby";
export type CityPostersSportArtworkVariant = "for-you" | "catalog";

export type CityPostersSportMatchArtworkInput = {
  sportType: string;
  variant: CityPostersSportArtworkVariant;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
};

export const cityPostersSportBackgrounds: Record<
  CityPostersSportType,
  Record<CityPostersSportArtworkVariant, URL>
> = {
  football: {
    "for-you": new URL("../../images/city-posters/sport-match-backgrounds/for-you-9x16/football.jpg", import.meta.url),
    catalog: new URL("../../images/city-posters/sport-match-backgrounds/catalog-4x3/football.jpg", import.meta.url),
  },
  ice_hockey: {
    "for-you": new URL("../../images/city-posters/sport-match-backgrounds/for-you-9x16/ice_hockey.jpg", import.meta.url),
    catalog: new URL("../../images/city-posters/sport-match-backgrounds/catalog-4x3/ice_hockey.jpg", import.meta.url),
  },
  basketball: {
    "for-you": new URL("../../images/city-posters/sport-match-backgrounds/for-you-9x16/basketball.jpg", import.meta.url),
    catalog: new URL("../../images/city-posters/sport-match-backgrounds/catalog-4x3/basketball.jpg", import.meta.url),
  },
  volleyball: {
    "for-you": new URL("../../images/city-posters/sport-match-backgrounds/for-you-9x16/volleyball.jpg", import.meta.url),
    catalog: new URL("../../images/city-posters/sport-match-backgrounds/catalog-4x3/volleyball.jpg", import.meta.url),
  },
  rugby: {
    "for-you": new URL("../../images/city-posters/sport-match-backgrounds/for-you-9x16/rugby.jpg", import.meta.url),
    catalog: new URL("../../images/city-posters/sport-match-backgrounds/catalog-4x3/rugby.jpg", import.meta.url),
  },
};

const normalizeKey = (value: string) => value
  .trim()
  .toLocaleLowerCase("en-US")
  .replace(/[\s-]+/g, "_");

const sportAliases: Record<string, CityPostersSportType> = {
  football: "football",
  soccer: "football",
  fotbal: "football",
  ice_hockey: "ice_hockey",
  hockey: "ice_hockey",
  icehockey: "ice_hockey",
  hokej: "ice_hockey",
  basketball: "basketball",
  basket: "basketball",
  volleyball: "volleyball",
  voleyball: "volleyball",
  volejbal: "volleyball",
  rugby: "rugby",
  ragby: "rugby",
};

export const normalizeCityPostersSportType = (value: string): CityPostersSportType | null =>
  sportAliases[normalizeKey(value)] || null;

const dimensionsByVariant = {
  "for-you": { width: 1080, height: 1920, logoWidth: 360, logoHeight: 260, logoY: 830, centerGap: 65 },
  catalog: { width: 1200, height: 900, logoWidth: 280, logoHeight: 190, logoY: 355, centerGap: 90 },
} as const;

const isConnectedLightBackgroundPixel = (data: Buffer, offset: number) => {
  const alpha = data[offset + 3];
  if (alpha < 24) return true;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const low = Math.min(red, green, blue);
  const high = Math.max(red, green, blue);
  return low >= 236 && high - low <= 18;
};

const removeConnectedLightBackground = async (bytes: Buffer, width: number, height: number) => {
  const { data, info } = await sharp(bytes)
    .resize(Math.max(width * 3, 600), Math.max(height * 3, 600), { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return;
    const index = y * info.width + x;
    if (visited[index] || !isConnectedLightBackgroundPixel(data, index * 4)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < info.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, info.height - 1);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    enqueue(0, y);
    enqueue(info.width - 1, y);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    data[index * 4 + 3] = 0;
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
};

export const normalizeCityPostersSportLogo = async (bytes: Buffer, width: number, height: number) => {
  const metadata = await sharp(bytes).metadata();
  const prepared = metadata.hasAlpha ? bytes : await removeConnectedLightBackground(bytes, width, height);
  return sharp(prepared)
    .trim({ threshold: 10 })
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
};

const loadRemoteLogo = async (
  value: string | null | undefined,
  width: number,
  height: number,
) => {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 2_000_000) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 2_000_000) return null;
    return normalizeCityPostersSportLogo(bytes, width, height);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const bitmapGlyphs: Record<string, readonly string[]> = {
  A: ["01110","10001","10001","11111","10001","10001","10001"],
  B: ["11110","10001","10001","11110","10001","10001","11110"],
  C: ["01111","10000","10000","10000","10000","10000","01111"],
  D: ["11110","10001","10001","10001","10001","10001","11110"],
  E: ["11111","10000","10000","11110","10000","10000","11111"],
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  G: ["01111","10000","10000","10111","10001","10001","01111"],
  H: ["10001","10001","10001","11111","10001","10001","10001"],
  I: ["11111","00100","00100","00100","00100","00100","11111"],
  J: ["00111","00010","00010","00010","10010","10010","01100"],
  K: ["10001","10010","10100","11000","10100","10010","10001"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  M: ["10001","11011","10101","10101","10001","10001","10001"],
  N: ["10001","11001","10101","10011","10001","10001","10001"],
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  P: ["11110","10001","10001","11110","10000","10000","10000"],
  Q: ["01110","10001","10001","10001","10101","10010","01101"],
  R: ["11110","10001","10001","11110","10100","10010","10001"],
  S: ["01111","10000","10000","01110","00001","00001","11110"],
  T: ["11111","00100","00100","00100","00100","00100","00100"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  V: ["10001","10001","10001","10001","10001","01010","00100"],
  W: ["10001","10001","10001","10101","10101","11011","10001"],
  X: ["10001","10001","01010","00100","01010","10001","10001"],
  Y: ["10001","10001","01010","00100","00100","00100","00100"],
  Z: ["11111","00001","00010","00100","01000","10000","11111"],
  0: ["01110","10001","10011","10101","11001","10001","01110"],
  1: ["00100","01100","00100","00100","00100","00100","01110"],
  2: ["01110","10001","00001","00010","00100","01000","11111"],
  3: ["11110","00001","00001","01110","00001","00001","11110"],
  4: ["00010","00110","01010","10010","11111","00010","00010"],
  5: ["11111","10000","10000","11110","00001","00001","11110"],
  6: ["01110","10000","10000","11110","10001","10001","01110"],
  7: ["11111","00001","00010","00100","01000","01000","01000"],
  8: ["01110","10001","10001","01110","10001","10001","01110"],
  9: ["01110","10001","10001","01111","00001","00001","01110"],
};

const normalizeBadgeInitials = (value: string) =>
  value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("en-US");

const fallbackBadge = async (teamName: string | null | undefined, size: number) => {
  if (!teamName) return null;
  const initials = normalizeBadgeInitials(cityPostersSportTeamInitials(teamName))
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3) || "TEAM";

  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.46;
  const innerRadius = radius - Math.max(6, Math.round(size * 0.035));
  const center = (size - 1) / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const distance = Math.hypot(x - center, y - center);
      if (distance <= radius) {
        const border = distance > innerRadius;
        pixels[offset] = border ? 255 : 17;
        pixels[offset + 1] = border ? 255 : 24;
        pixels[offset + 2] = border ? 255 : 39;
        pixels[offset + 3] = border ? 255 : 235;
      }
    }
  }

  const glyphs = Array.from(initials).map((char) => bitmapGlyphs[char] || bitmapGlyphs.X);
  const pixelSize = Math.max(3, Math.floor(size / 30));
  const gap = pixelSize;
  const textWidth = glyphs.reduce((total, glyph, index) =>
    total + glyph[0].length * pixelSize + (index ? gap : 0), 0);
  const textHeight = 7 * pixelSize;
  const originX = Math.round((size - textWidth) / 2);
  const originY = Math.round((size - textHeight) / 2);

  let cursorX = originX;
  for (const glyph of glyphs) {
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== "1") continue;
        const startX = cursorX + col * pixelSize;
        const startY = originY + row * pixelSize;
        for (let py = 0; py < pixelSize; py += 1) {
          for (let px = 0; px < pixelSize; px += 1) {
            const x = startX + px;
            const y = startY + py;
            if (x < 0 || x >= size || y < 0 || y >= size) continue;
            const offset = (y * size + x) * 4;
            pixels[offset] = 255;
            pixels[offset + 1] = 255;
            pixels[offset + 2] = 255;
            pixels[offset + 3] = 255;
          }
        }
      }
    }
    cursorX += glyph[0].length * pixelSize + gap;
  }

  return sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
};

export const renderCityPostersSportMatchArtworkJpeg = async (
  input: CityPostersSportMatchArtworkInput,
) => {
  const sportType = normalizeCityPostersSportType(input.sportType);
  if (!sportType) throw new Error("unsupported_sport_type");

  const dimensions = dimensionsByVariant[input.variant];
  const background = cityPostersSportBackgrounds[sportType][input.variant];
  const [homeRemote, awayRemote] = await Promise.all([
    loadRemoteLogo(input.homeLogoUrl, dimensions.logoWidth, dimensions.logoHeight),
    loadRemoteLogo(input.awayLogoUrl, dimensions.logoWidth, dimensions.logoHeight),
  ]);
  const [homeFallback, awayFallback] = await Promise.all([
    fallbackBadge(input.homeTeamName, dimensions.logoHeight),
    fallbackBadge(input.awayTeamName, dimensions.logoHeight),
  ]);
  const centerFallback = async (badge: Buffer | null) => badge
    ? sharp({
      create: {
        width: dimensions.logoWidth,
        height: dimensions.logoHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{
        input: badge,
        left: Math.round((dimensions.logoWidth - dimensions.logoHeight) / 2),
        top: 0,
      }])
      .png()
      .toBuffer()
    : null;
  const [homeLogo, awayLogo] = await Promise.all([
    homeRemote || centerFallback(homeFallback),
    awayRemote || centerFallback(awayFallback),
  ]);

  const centerX = Math.round(dimensions.width / 2);
  const overlays = [
    ...(homeLogo ? [{
      input: homeLogo,
      left: centerX - dimensions.centerGap - dimensions.logoWidth,
      top: dimensions.logoY,
    }] : []),
    ...(awayLogo ? [{
      input: awayLogo,
      left: centerX + dimensions.centerGap,
      top: dimensions.logoY,
    }] : []),
  ];

  return sharp(readFileSync(background))
    .resize(dimensions.width, dimensions.height, { fit: "cover", position: "centre" })
    .composite(overlays)
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
};
