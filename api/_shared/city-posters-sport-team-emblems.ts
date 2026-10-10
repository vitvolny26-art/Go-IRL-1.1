export type CityPostersSportTeams = { homeTeamName: string; awayTeamName: string };

export type CityPostersSportTeamEmblemProvenance = "official-club" | "official-league" | "owner-provided";

export type CityPostersSportTeamEmblem = {
  url: string;
  provenance: CityPostersSportTeamEmblemProvenance;
  sourceUrl?: string;
  rendererUrl?: string;
  rendererProvenance?: CityPostersSportTeamEmblemProvenance;
  rendererSourceUrl?: string;
};

const normalizeTeamKey = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("en-US")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export const cityPostersSportTeamEmblems: Record<string, CityPostersSportTeamEmblem> = {
  "byd energie karlovy vary": {
    url: "/city-posters/sports/ice-hockey/team-emblems/byd-energie-karlovy-vary.png",
    provenance: "official-club",
    sourceUrl: "https://www.hokejkv.cz/",
  },
  "fc slovan liberec": {
    url: "/city-posters/sports/football/team-emblems/fc-slovan-liberec.png",
    provenance: "official-club",
    sourceUrl: "https://www.fcslovanliberec.cz/kontakt",
  },
  "hc dynamo pardubice": {
    url: "/city-posters/sports/ice-hockey/team-emblems/hc-dynamo-pardubice.png",
    provenance: "official-club",
    sourceUrl: "https://www.hcdynamo.cz/",
  },
  "bk mlada boleslav": {
    url: "/city-posters/sports/ice-hockey/team-emblems/bk-mlada-boleslav.png",
    provenance: "official-club",
    sourceUrl: "https://www.bkboleslav.cz/",
  },
  "tj sokol marianske hory": {
    url: "/city-posters/sports/rugby/team-emblems/tj-sokol-marianske-hory.png",
    provenance: "official-club",
    sourceUrl: "https://www.rugbyostrava.cz/",
  },
  "vk prostejov b": {
    url: "/city-posters/sports/volleyball/team-emblems/vk-prostejov-b.png",
    provenance: "official-league",
    sourceUrl: "https://cvf.cz/souteze/krajske-souteze?competitionId=18752&gameId=945542&mode=clubs&teamId=94946",
  },
  "velory olomouc": {
    url: "/city-posters/sports/volleyball/team-emblems/velory-olomouc.png",
    provenance: "owner-provided",
  },
  "bk loko balimania plzen": {
    url: "/city-posters/sports/basketball/team-emblems/bk-loko-balimania-plzen.png",
    provenance: "official-club",
    sourceUrl: "https://www.bkloko-plzen.cz/news/2501/1066/plzensti-basketbaliste-se-po-ctrnacti-letech-vraceji-do-nejvyssi-souteze-jako-bk-loko-balimania-plzen/",
  },
  "rc olomouc": {
    url: "/city-posters/sports/rugby/team-emblems/rc-olomouc.png",
    provenance: "official-club",
    sourceUrl: "https://www.rugbyolomouc.cz/klub/ke-stazeni.html",
  },
  "jimi rc vyskov": {
    url: "https://4759cbf9b9.clvaw-cdnwnd.com/7d24613558f1bc3463afffcad225df1f/200000023-d8960d8963/nove-logo.png?ph=4759cbf9b9",
    provenance: "official-club",
    sourceUrl: "https://www.rugbyvyskov.cz/",
    rendererUrl: "https://is.rugbyunion.cz/data//club/logo/c7bc212608e58ac1ef4c6ee78480be62.jpg",
    rendererProvenance: "official-league",
    rendererSourceUrl: "https://www.rugbyunion.cz/kluby/jimi-rc-vyskov",
  },
  "bk olomoucko": {
    url: "/city-posters/sports/basketball/team-emblems/bk-olomoucko.png",
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

export const resolveCityPostersSportTeamRendererEmblem = (teamName: string) => {
  const emblem = cityPostersSportTeamEmblems[normalizeTeamKey(teamName)];
  return emblem?.rendererUrl || emblem?.url || null;
};

export const cityPostersSportTeamInitials = (teamName: string) => {
  const ignored = new Set(["bk", "bc", "rc", "fc", "hc", "jimi", "energy"]);
  const words = teamName.trim().split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => !ignored.has(normalizeTeamKey(word)));
  const source = meaningful.length ? meaningful : words;
  return source.slice(0, 3).map((word) => Array.from(word)[0]?.toLocaleUpperCase("cs-CZ") || "").join("") || "TEAM";
};
