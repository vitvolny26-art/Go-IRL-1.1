export type CityPostersSportArtworkVariant = "for-you" | "catalog";

type CityPostersSportType = "football" | "ice_hockey" | "basketball" | "volleyball" | "rugby";

type CityPostersSportArtworkRow = {
  subcategory?: string | null;
  hero_media_url?: string | null;
  canonical_slug?: string | null;
};

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

const sportArtworkApiOrigin = "https://go-irl-1-1.vercel.app";

const normalizeKey = (value: string) =>
  value.trim().toLocaleLowerCase("en-US").replace(/[\s-]+/g, "_");

export const normalizeCityPostersSportSubcategory = (
  value: string | null | undefined,
): CityPostersSportType | null => {
  if (!value) return null;
  return sportAliases[normalizeKey(value)] || null;
};

export const resolveCityPostersSportFallbackArtwork = (
  row: CityPostersSportArtworkRow,
  variant: CityPostersSportArtworkVariant,
) => {
  const sportType = normalizeCityPostersSportSubcategory(row.subcategory);
  if (sportType) {
    const folder = variant === "for-you" ? "for-you-9x16" : "catalog-4x3";
    return `/city-posters/sport-match-backgrounds/${folder}/${sportType}.jpg`;
  }
  return row.hero_media_url || "/city-posters/category-backgrounds/sport.webp";
};

export const resolveCityPostersSportArtwork = (
  row: CityPostersSportArtworkRow,
  variant: CityPostersSportArtworkVariant,
) => {
  const sportType = normalizeCityPostersSportSubcategory(row.subcategory);
  if (sportType && row.canonical_slug) {
    const url = new URL("/api/telegram/event-share-card", sportArtworkApiOrigin);
    url.searchParams.set("slug", row.canonical_slug);
    url.searchParams.set("variant", variant);
    url.searchParams.set("mode", "city-posters-sport");
    url.searchParams.set("v", "afishi021b-2");
    return url.toString();
  }
  if (sportType) {
    const folder = variant === "for-you" ? "for-you-9x16" : "catalog-4x3";
    return `/city-posters/sport-match-backgrounds/${folder}/${sportType}.jpg`;
  }
  return row.hero_media_url || "/city-posters/category-backgrounds/sport.webp";
};
