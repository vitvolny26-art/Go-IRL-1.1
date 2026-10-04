export type CityPostersSportTeams = { homeTeamName: string; awayTeamName: string };

export type CityPostersSportTeamEmblemProvenance = "official-club" | "official-league";

export type CityPostersSportTeamEmblem = {
  url: string;
  provenance: CityPostersSportTeamEmblemProvenance;
  sourceUrl: string;
};

const normalizeTeamKey = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("en-US")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export const cityPostersSportTeamEmblems: Record<string, CityPostersSportTeamEmblem> = {
  "rc olomouc": {
    url: "https://www.rugbyolomouc.cz/files/uploads/fanzone/Logo/Logo%20RUGBY%20CLUB%20Olomouc.png",
    provenance: "official-club",
    sourceUrl: "https://www.rugbyolomouc.cz/klub/ke-stazeni.html",
  },
  "jimi rc vyskov": {
    url: "https://4759cbf9b9.clvaw-cdnwnd.com/7d24613558f1bc3463afffcad225df1f/200000023-d8960d8963/nove-logo.png?ph=4759cbf9b9",
    provenance: "official-club",
    sourceUrl: "https://www.rugbyvyskov.cz/",
  },
  "bk olomoucko": {
    url: "https://cbf.cz/files/392197MDl.png",
    provenance: "official-league",
    sourceUrl: "https://www.nbl.basketball/tym/bk-olomoucko",
  },
  "bk armex energy decin": {
    url: "https://cbf.cz/files/435933YjR.png",
    provenance: "official-league",
    sourceUrl: "https://nbl.basketball/tym/bk-armex-energy-decin",
  },
  "hc olomouc": {
    url: "https://hc-olomouc.esports.cz/foto/logo_png.png",
    provenance: "official-club",
    sourceUrl: "https://www.hc-olomouc.cz/informace-o-klubu",
  },
  "hc ocelari trinec": {
    url: "https://hcocelari.esports.cz/files/logos/Trinec.png",
    provenance: "official-club",
    sourceUrl: "https://www.hcocelari.cz/",
  },
  "sk sigma olomouc": {
    url: "https://sigmafotbal.esports.cz/files/editor/SK%20Sigma%20Olomouc%20-%20logo.png",
    provenance: "official-club",
    sourceUrl: "https://sigmafotbal.cz/ke-stazeni",
  },
};

export const parseCityPostersSportTeams = (title: string): CityPostersSportTeams | null => {
  const match = title.trim().match(/^(.+?)\s+(?:–|—|-)\s+(.+)$/u);
  if (!match) return null;
  const homeTeamName = match[1].trim();
  const awayTeamName = match[2].trim();
  return homeTeamName && awayTeamName ? { homeTeamName, awayTeamName } : null;
};

export const resolveCityPostersSportTeamEmblem = (teamName: string) =>
  cityPostersSportTeamEmblems[normalizeTeamKey(teamName)]?.url || null;

export const cityPostersSportTeamInitials = (teamName: string) => {
  const ignored = new Set(["bk", "bc", "rc", "fc", "hc", "jimi", "energy"]);
  const words = teamName.trim().split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => !ignored.has(normalizeTeamKey(word)));
  const source = meaningful.length ? meaningful : words;
  return source.slice(0, 3).map((word) => Array.from(word)[0]?.toLocaleUpperCase("cs-CZ") || "").join("") || "TEAM";
};
