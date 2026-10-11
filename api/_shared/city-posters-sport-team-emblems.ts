export type CityPostersSportTeams = { homeTeamName: string; awayTeamName: string };

export type CityPostersSportTeamEmblemProvenance = "official-club" | "official-league" | "owner-provided" | "repository-asset";

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

// Reuse every audited repository PNG. Unknown provenance is not inferred from a filename.
const firstPartyTeamEmblemSlugs = [
  "basketball/bk-armex-energy-decin",
  "basketball/bk-gapa-hradec-kralove",
  "basketball/bk-kvis-pardubice",
  "basketball/bk-loko-balimania-plzen",
  "basketball/bk-lokomotiva-plzen",
  "basketball/bk-olomoucko",
  "basketball/bk-opava",
  "basketball/nh-ostrava",
  "basketball/pumpa-basket-brno",
  "basketball/sk-slavia-praha-era-nbk",
  "basketball/sluneta-usti-nad-labem",
  "basketball/srsni-photomate-pisek",
  "basketball/usk-praha",
  "football/1-fc-slovacko",
  "football/ac-sparta-praha",
  "football/bohemians-praha-1905",
  "football/fc-banik-ostrava",
  "football/fc-hradec-kralove",
  "football/fc-slovan-liberec",
  "football/fc-viktoria-plzen",
  "football/fc-zbrojovka-brno",
  "football/fc-zlin",
  "football/fk-jablonec",
  "football/fk-mlada-boleslav",
  "football/fk-pardubice",
  "football/fk-teplice",
  "football/sk-artis-brno",
  "football/sk-sigma-olomouc",
  "football/sk-slavia-praha",
  "ice-hockey/banes-motor-c-budejovice",
  "ice-hockey/bili-tygri-liberec",
  "ice-hockey/bk-mlada-boleslav",
  "ice-hockey/byd-energie-karlovy-vary",
  "ice-hockey/hc-dynamo-pardubice",
  "ice-hockey/hc-kometa-brno",
  "ice-hockey/hc-ocelari-trinec",
  "ice-hockey/hc-olomouc",
  "ice-hockey/hc-skoda-plzen",
  "ice-hockey/hc-sparta-praha",
  "ice-hockey/hc-verva-litvinov",
  "ice-hockey/hc-vitkovice-ridera",
  "ice-hockey/mountfield-hk",
  "ice-hockey/rytiri-kladno",
  "rugby/jimi-rc-vyskov",
  "rugby/rc-dragon-brno",
  "rugby/rc-mountfield-ricany",
  "rugby/rc-olomouc",
  "rugby/rc-slavia-praha",
  "rugby/rc-tatra-smichov",
  "rugby/ru-donau-vienna",
  "rugby/tj-sokol-marianske-hory",
  "volleyball/aero-odolena-voda",
  "volleyball/black-volley-beskydy",
  "volleyball/cez-karlovarsko",
  "volleyball/kladno-volejbal-cz",
  "volleyball/skv-usti-nad-labem",
  "volleyball/velory-olomouc",
  "volleyball/vk-dukla-liberec",
  "volleyball/vk-jihostroj-ceske-budejovice",
  "volleyball/vk-lvi-praha",
  "volleyball/vk-ostrava",
  "volleyball/vk-prostejov-b",
  "volleyball/vk-trox-pribram",
  "volleyball/volejbal-brno",
  "volleyball/volejbalovy-klub-benatky-nad-jizerou",
  "volleyball/vsc-zlin",
] as const;

const firstPartyTeamEmblems: Record<string, CityPostersSportTeamEmblem> = Object.fromEntries(
  firstPartyTeamEmblemSlugs.map((slug) => {
    const [sport, fileName] = slug.split("/");
    return [fileName.replace(/-/g, " "), {
      url: `/city-posters/sports/${sport}/team-emblems/${fileName}.png`,
      provenance: "repository-asset" as const,
    }];
  }),
);

export const cityPostersSportTeamEmblems: Record<string, CityPostersSportTeamEmblem> = {
  ...firstPartyTeamEmblems,
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
    url: "/city-posters/sports/rugby/team-emblems/jimi-rc-vyskov.png",
    provenance: "official-club",
    sourceUrl: "https://www.rugbyvyskov.cz/",
    rendererUrl: "/city-posters/sports/rugby/team-emblems/jimi-rc-vyskov.png",
    rendererProvenance: "official-league",
    rendererSourceUrl: "https://www.rugbyunion.cz/kluby/jimi-rc-vyskov",
  },
  "bk olomoucko": {
    url: "/city-posters/sports/basketball/team-emblems/bk-olomoucko.png",
    provenance: "official-league",
    sourceUrl: "https://www.nbl.basketball/tym/bk-olomoucko",
  },
  "bk armex energy decin": {
    url: "/city-posters/sports/basketball/team-emblems/bk-armex-energy-decin.png",
    provenance: "official-league",
    sourceUrl: "https://nbl.basketball/tym/bk-armex-energy-decin",
  },
  "hc olomouc": {
    url: "/city-posters/sports/ice-hockey/team-emblems/hc-olomouc.png",
    provenance: "official-club",
    sourceUrl: "https://www.hc-olomouc.cz/informace-o-klubu",
  },
  "hc ocelari trinec": {
    url: "/city-posters/sports/ice-hockey/team-emblems/hc-ocelari-trinec.png",
    provenance: "official-club",
    sourceUrl: "https://www.hcocelari.cz/",
  },
  "sk sigma olomouc": {
    url: "/city-posters/sports/football/team-emblems/sk-sigma-olomouc.png",
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
