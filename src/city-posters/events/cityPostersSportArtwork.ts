export type CityPostersSportArtworkVariant = "for-you" | "catalog";

type CityPostersSportType = "football" | "ice_hockey" | "basketball" | "volleyball" | "rugby";

type CityPostersSportArtworkRow = {
  subcategory?: string | null;
  hero_media_url?: string | null;
  canonical_slug?: string | null;
  title?: string | null;
};

export type CityPostersSportBrowserFallbackTeam = {
  logoUrl: string | null;
  initials: string;
};

export type CityPostersSportBrowserFallback = {
  home: CityPostersSportBrowserFallbackTeam;
  away: CityPostersSportBrowserFallbackTeam;
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

const rugbyBrowserFallbackLogos: Record<string, string> = {
  "rc olomouc": "/city-posters/team-emblems/rc-olomouc-official.svg",
  "jimi rc vyskov": "https://4759cbf9b9.clvaw-cdnwnd.com/7d24613558f1bc3463afffcad225df1f/200000023-d8960d8963/nove-logo.png?ph=4759cbf9b9",
};

const normalizeKey = (value: string) =>
  value.trim().toLocaleLowerCase("en-US").replace(/[\s-]+/g, "_");

const normalizeTeamKey = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("en-US")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const sportTeamInitials = (value: string) => {
  const ignored = new Set(["bk", "bc", "rc", "fc", "hc", "jimi", "energy"]);
  const words = value.trim().split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => !ignored.has(normalizeTeamKey(word)));
  const source = meaningful.length ? meaningful : words;
  return source.slice(0, 3).map((word) => Array.from(word)[0]?.toLocaleUpperCase("cs-CZ") || "").join("") || "TEAM";
};

const parseSportTeams = (title: string) => {
  const match = title.trim().match(/^(.+?)\s+(?:–|—|-)\s+(.+)$/u);
  if (!match) return null;
  const home = match[1].trim();
  const away = match[2].trim();
  return home && away ? { home, away } : null;
};

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

export const resolveCityPostersSportBrowserFallback = (
  row: CityPostersSportArtworkRow,
): CityPostersSportBrowserFallback | null => {
  if (normalizeCityPostersSportSubcategory(row.subcategory) !== "rugby" || !row.title) return null;
  const teams = parseSportTeams(row.title);
  if (!teams) return null;
  const team = (name: string): CityPostersSportBrowserFallbackTeam => ({
    logoUrl: rugbyBrowserFallbackLogos[normalizeTeamKey(name)] || null,
    initials: sportTeamInitials(name),
  });
  return { home: team(teams.home), away: team(teams.away) };
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
    url.searchParams.set("v", "afishi021b-4");
    return url.toString();
  }
  if (sportType) {
    const folder = variant === "for-you" ? "for-you-9x16" : "catalog-4x3";
    return `/city-posters/sport-match-backgrounds/${folder}/${sportType}.jpg`;
  }
  return row.hero_media_url || "/city-posters/category-backgrounds/sport.webp";
};
