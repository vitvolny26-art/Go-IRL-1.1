export const socialAttributionSources = [
  "telegram",
  "whatsapp",
  "messenger",
  "instagram",
  "facebook",
  "native",
  "copy",
] as const;

export const socialAttributionMediums = [
  "message",
  "share",
  "post",
  "story",
  "reel",
  "copy",
] as const;

export type SocialAttributionSource = (typeof socialAttributionSources)[number];
export type SocialAttributionMedium = (typeof socialAttributionMediums)[number];

export type SocialAttribution = {
  source?: SocialAttributionSource;
  medium?: SocialAttributionMedium;
  campaign?: string;
  ref?: string;
};

export type ActivityAttributionSession = SocialAttribution & {
  activityId: string;
  entryPath: string;
};

export type AttributionStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const socialAttributionSessionKey = "go-irl-social-attribution-v1";
export const socialAttributionParamKeys = ["source", "medium", "campaign", "ref"] as const;

const sourceSet = new Set<string>(socialAttributionSources);
const mediumSet = new Set<string>(socialAttributionMediums);
const campaignPattern = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/;
const refPattern = /^[A-Za-z0-9_-]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const activityEntryPattern = /^\/(?:e\/([0-9a-f-]{36})(?:\/(?:ru|uk|cs|en|pl|sk))?|join\/([0-9a-f-]{36}))\/?$/i;

const readSearchParams = (value: string | URLSearchParams) => {
  if (value instanceof URLSearchParams) return value;
  return new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
};

const validCampaign = (value: string) =>
  value.length > 0 && value.length <= 64 && campaignPattern.test(value);

const validRef = (value: string) =>
  value.length > 0
  && value.length <= 96
  && refPattern.test(value);

export const parseSocialAttribution = (value: string | URLSearchParams): SocialAttribution => {
  const params = readSearchParams(value);
  const attribution: SocialAttribution = {};
  const source = params.get("source") || "";
  const medium = params.get("medium") || "";
  const campaign = params.get("campaign") || "";
  const ref = params.get("ref") || "";

  if (sourceSet.has(source)) attribution.source = source as SocialAttributionSource;
  if (mediumSet.has(medium)) attribution.medium = medium as SocialAttributionMedium;
  if (validCampaign(campaign)) attribution.campaign = campaign;
  if (validRef(ref)) attribution.ref = ref;

  return attribution;
};

export const hasSocialAttribution = (value: SocialAttribution) =>
  Boolean(value.source || value.medium || value.campaign || value.ref);

export const buildSocialAttributionUrl = (baseUrl: string, value: SocialAttribution) => {
  try {
    const url = new URL(baseUrl);
    for (const key of socialAttributionParamKeys) url.searchParams.delete(key);
    const attribution = parseSocialAttribution(new URLSearchParams(
      Object.entries(value).flatMap(([key, entry]) => entry ? [[key, entry]] : []),
    ));
    if (attribution.source) url.searchParams.set("source", attribution.source);
    if (attribution.medium) url.searchParams.set("medium", attribution.medium);
    if (attribution.campaign) url.searchParams.set("campaign", attribution.campaign);
    if (attribution.ref) url.searchParams.set("ref", attribution.ref);
    return url.toString();
  } catch {
    return baseUrl;
  }
};

const resolveStorage = (storage?: AttributionStorage | null) => {
  if (storage !== undefined) return storage;
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
};

const activityEntry = (pathname: string) => {
  const match = pathname.match(activityEntryPattern);
  const activityId = match?.[1] || match?.[2] || "";
  return uuidPattern.test(activityId) ? { activityId, entryPath: pathname } : null;
};

export const buildActivityAttributionSession = (input: {
  activityId: string;
  entryPath: string;
  search: string | URLSearchParams;
}): ActivityAttributionSession | null => {
  if (!uuidPattern.test(input.activityId)) return null;
  const attribution = parseSocialAttribution(input.search);
  if (!hasSocialAttribution(attribution)) return null;
  return {
    activityId: input.activityId,
    entryPath: input.entryPath,
    ...attribution,
  };
};

export const captureActivityAttribution = (input: {
  pathname: string;
  search: string;
  storage?: AttributionStorage | null;
}): ActivityAttributionSession | null => {
  const entry = activityEntry(input.pathname);
  if (!entry) return null;

  const storage = resolveStorage(input.storage);
  const captured = buildActivityAttributionSession({
    activityId: entry.activityId,
    entryPath: entry.entryPath,
    search: input.search,
  });
  if (!captured) {
    storage?.removeItem(socialAttributionSessionKey);
    return null;
  }

  storage?.setItem(socialAttributionSessionKey, JSON.stringify(captured));
  return captured;
};

export const readActivityAttribution = (
  storage?: AttributionStorage | null,
): ActivityAttributionSession | null => {
  const target = resolveStorage(storage);
  if (!target) return null;
  try {
    const raw = JSON.parse(target.getItem(socialAttributionSessionKey) || "null") as Partial<ActivityAttributionSession> | null;
    const entry = raw && typeof raw.entryPath === "string" ? activityEntry(raw.entryPath) : null;
    if (!raw || typeof raw.activityId !== "string" || !uuidPattern.test(raw.activityId) || !entry || entry.activityId !== raw.activityId) {
      target.removeItem(socialAttributionSessionKey);
      return null;
    }
    const attribution = parseSocialAttribution(new URLSearchParams(
      Object.entries(raw).flatMap(([key, entry]) => socialAttributionParamKeys.includes(key as typeof socialAttributionParamKeys[number]) && typeof entry === "string"
        ? [[key, entry]]
        : []),
    ));
    if (!hasSocialAttribution(attribution)) {
      target.removeItem(socialAttributionSessionKey);
      return null;
    }
    return {
      activityId: entry.activityId,
      entryPath: entry.entryPath,
      ...attribution,
    };
  } catch {
    target.removeItem(socialAttributionSessionKey);
    return null;
  }
};
