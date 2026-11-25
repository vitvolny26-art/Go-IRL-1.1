import { isActivityFinished } from "../eventInteractionState";
import type { Activity } from "../types";

export type MyGoIrlProjection = {
  upcomingCreated: Activity[];
  upcomingJoined: Activity[];
  pendingRequests: Activity[];
  past: Activity[];
};

export function buildOrganizerEventHistory(activities: readonly Activity[], userKey: string, now = new Date()): Activity[] {
  if (!userKey) return [];
  const unique = new Map(activities.map((activity) => [activity.id, activity]));
  return [...unique.values()]
    .filter((activity) => activity.organizerKey === userKey && activity.seriesOccurrenceStatus !== "cancelled" && isActivityFinished(activity, now))
    .sort((left, right) => right.date.localeCompare(left.date) || right.time.localeCompare(left.time) || left.id.localeCompare(right.id));
}

export function buildMyGoIrlProjection(
  activities: readonly Activity[],
  userKey: string,
  joinedIds: readonly string[],
  pendingIds: readonly string[],
  now = new Date(),
): MyGoIrlProjection {
  const joined = new Set(joinedIds);
  const pending = new Set(pendingIds);
  const relevant = activities.filter((activity) => (
    activity.organizerKey === userKey || joined.has(activity.id) || pending.has(activity.id)
  ));
  const upcoming = relevant.filter((activity) => !isActivityFinished(activity, now));

  return {
    upcomingCreated: upcoming.filter((activity) => activity.organizerKey === userKey),
    upcomingJoined: upcoming.filter((activity) => joined.has(activity.id) && activity.organizerKey !== userKey),
    pendingRequests: upcoming.filter((activity) => pending.has(activity.id)),
    past: buildOrganizerEventHistory(relevant, userKey, now),
  };
}
