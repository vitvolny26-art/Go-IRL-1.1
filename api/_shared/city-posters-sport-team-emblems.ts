export type CityPostersSportTeams = { homeTeamName: string; awayTeamName: string };

const normalizeTeamKey = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("en-US")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export const cityPostersSportTeamEmblems: Record<string, string> = {
  "rc olomouc": "https://www.rugbyolomouc.cz/files/uploads/fanzone/Logo/Logo%20RUGBY%20CLUB%20Olomouc.png",
};

export const parseCityPostersSportTeams = (title: string): CityPostersSportTeams | null => {
  const match = title.trim().match(/^(.+?)\s+(?:–|—|-)\s+(.+)$/u);
  if (!match) return null;
  const homeTeamName = match[1].trim();
  const awayTeamName = match[2].trim();
  return homeTeamName && awayTeamName ? { homeTeamName, awayTeamName } : null;
};

export const resolveCityPostersSportTeamEmblem = (teamName: string) =>
  cityPostersSportTeamEmblems[normalizeTeamKey(teamName)] || null;

export const cityPostersSportTeamInitials = (teamName: string) => {
  const ignored = new Set(["bk", "bc", "rc", "fc", "hc", "jimi", "energy"]);
  const words = teamName.trim().split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => !ignored.has(normalizeTeamKey(word)));
  const source = meaningful.length ? meaningful : words;
  return source.slice(0, 3).map((word) => Array.from(word)[0]?.toLocaleUpperCase("cs-CZ") || "").join("") || "TEAM";
};
