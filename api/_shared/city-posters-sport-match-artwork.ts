import { readFileSync } from "node:fs";
import sharp from "sharp";
import { cityPostersSportTeamInitials } from "./city-posters-sport-team-emblems.js";
import { configureTelegramShareCardFonts } from "./telegram-share-card-image.js";

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
  "for-you": { width: 1080, height: 1920, logoSize: 260, logoY: 830 },
  catalog: { width: 1200, height: 900, logoSize: 190, logoY: 355 },
} as const;

const loadRemoteLogo = async (value: string | null | undefined, size: number) => {
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
    return sharp(bytes)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
}[char] || char));

const fallbackBadge = async (teamName: string | null | undefined, size: number) => {
  if (!teamName) return null;
  configureTelegramShareCardFonts();
  const initials = escapeXml(cityPostersSportTeamInitials(teamName));
  const strokeWidth = Math.max(6, Math.round(size * 0.035));
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.46}" fill="#111827" fill-opacity="0.88" stroke="#fff" stroke-width="${strokeWidth}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="DejaVu Sans,sans-serif" font-size="${Math.round(size * 0.30)}" font-weight="700">${initials}</text></svg>`,
  );
  return sharp(svg).png().toBuffer();
};

export const renderCityPostersSportMatchArtworkJpeg = async (
  input: CityPostersSportMatchArtworkInput,
) => {
  const sportType = normalizeCityPostersSportType(input.sportType);
  if (!sportType) throw new Error("unsupported_sport_type");

  const dimensions = dimensionsByVariant[input.variant];
  const background = cityPostersSportBackgrounds[sportType][input.variant];
  const [homeRemote, awayRemote] = await Promise.all([
    loadRemoteLogo(input.homeLogoUrl, dimensions.logoSize),
    loadRemoteLogo(input.awayLogoUrl, dimensions.logoSize),
  ]);
  const [homeLogo, awayLogo] = await Promise.all([
    homeRemote || fallbackBadge(input.homeTeamName, dimensions.logoSize),
    awayRemote || fallbackBadge(input.awayTeamName, dimensions.logoSize),
  ]);

  const centerGap = input.variant === "for-you" ? 115 : 135;
  const centerX = Math.round(dimensions.width / 2);
  const overlays = [
    ...(homeLogo ? [{ input: homeLogo, left: centerX - centerGap - dimensions.logoSize, top: dimensions.logoY }] : []),
    ...(awayLogo ? [{ input: awayLogo, left: centerX + centerGap, top: dimensions.logoY }] : []),
  ];

  return sharp(readFileSync(background))
    .resize(dimensions.width, dimensions.height, { fit: "cover", position: "centre" })
    .composite(overlays)
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
};
