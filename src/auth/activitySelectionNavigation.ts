import { buildCanonicalActivityEntryPath, resolveActivityEntryIntent } from "./activityEntryIntent";

export const activitySelectionReturnStorageKey = "go-irl-activity-selection-return-v1";

export const activitySelectionTriggerSelector = ".sport-card-main, .event-details-action";
export const activitySelectionIdSelector = "[data-activity-id]";

type ActivitySelectionLocation = {
  pathname: string;
  search?: string;
  hash?: string;
};

const normalizePath = (pathname: string) => pathname.replace(/\/+$/, "") || "/";

export const shouldCanonicalizeGuestActivitySelection = (
  location: ActivitySelectionLocation,
  activityId: string,
) => normalizePath(location.pathname) === "/activities"
  && !resolveActivityEntryIntent(location)
  && Boolean(activityId);

export const buildGuestActivitySelectionPath = (
  activityId: string,
  search = "",
) => buildCanonicalActivityEntryPath({ activityId, action: "view", route: "event" }, search);

export const buildActivitySelectionReturnPath = (location: ActivitySelectionLocation) => {
  const pathname = normalizePath(location.pathname);
  if (pathname !== "/activities") return null;
  return `${pathname}${location.search || ""}${location.hash || ""}`;
};

export const resolveStoredActivitySelectionReturnPath = (value: string | null) => {
  if (!value || value.startsWith("//")) return "/activities";
  try {
    const url = new URL(value, "https://go-irl.fun");
    if (url.origin !== "https://go-irl.fun" || normalizePath(url.pathname) !== "/activities") {
      return "/activities";
    }
    return `${normalizePath(url.pathname)}${url.search}${url.hash}`;
  } catch {
    return "/activities";
  }
};

export const activityIdFromSelectionTarget = (target: Element) => target
  .closest("article")
  ?.querySelector<HTMLElement>(activitySelectionIdSelector)
  ?.dataset.activityId
  ?.trim() || "";