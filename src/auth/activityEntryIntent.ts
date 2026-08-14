import { activityIdFromJoinPath, isValidInvitationEventId } from "../invitationLink";

export const activityEntryActions = ["view", "join", "request_to_join"] as const;

export type ActivityEntryAction = (typeof activityEntryActions)[number];

export type ActivityEntryIntent = {
  activityId: string;
  action: ActivityEntryAction;
  route: "event" | "join";
  language?: "ru" | "uk" | "cs" | "en";
};

type ActivityEntryLocation = {
  pathname: string;
  search?: string;
  hash?: string;
};

const actionSet = new Set<string>(activityEntryActions);

const normalizeAction = (value: string | null | undefined): ActivityEntryAction | null => {
  const normalized = String(value || "").trim().toLowerCase().replaceAll("-", "_");
  return actionSet.has(normalized) ? normalized as ActivityEntryAction : null;
};

const languageFromEntryPath = (pathname: string): ActivityEntryIntent["language"] => {
  const match = pathname.replace(/\/+$/, "").match(/\/(ru|uk|cs|en)$/i);
  return match?.[1]?.toLowerCase() as ActivityEntryIntent["language"] || undefined;
};

const activityIdFromEventPath = (pathname: string) => {
  const match = pathname.match(/^\/e\/([^/?#]+)(?:\/(?:ru|uk|cs|en))?\/?$/i);
  if (!match?.[1]) return "";
  try {
    const activityId = decodeURIComponent(match[1]).trim();
    return isValidInvitationEventId(activityId) ? activityId : "";
  } catch {
    return "";
  }
};

export function resolveActivityEntryIntent({
  pathname,
  search = "",
  hash = "",
}: ActivityEntryLocation): ActivityEntryIntent | null {
  const eventActivityId = activityIdFromEventPath(pathname);
  const joinActivityId = activityIdFromJoinPath(pathname);
  const activityId = eventActivityId || joinActivityId;
  if (!activityId) return null;

  const queryAction = normalizeAction(new URLSearchParams(search).get("intent"));
  const hashAction = normalizeAction(hash.replace(/^#/, ""));
  const route = eventActivityId ? "event" : "join";

  return {
    activityId,
    action: hashAction || queryAction || (route === "join" ? "join" : "view"),
    route,
    language: languageFromEntryPath(pathname),
  };
}

export function resolveActivityEntryIntentFromUrl(candidate: string, applicationOrigin: string) {
  try {
    const origin = new URL(applicationOrigin).origin;
    const url = new URL(candidate, origin);
    if (url.origin !== origin) return null;
    return resolveActivityEntryIntent(url);
  } catch {
    return null;
  }
}

export function buildCanonicalActivityEntryPath(
  intent: ActivityEntryIntent,
  search = "",
) {
  const params = new URLSearchParams(search);
  params.delete("intent");
  const query = params.toString();
  const action = intent.action === "view" ? "" : `#${intent.action}`;
  const language = intent.language ? `/${intent.language}` : "";
  return `/e/${encodeURIComponent(intent.activityId)}${language}${query ? `?${query}` : ""}${action}`;
}
