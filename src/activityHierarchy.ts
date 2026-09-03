import type { Activity, ActivityHierarchyMetadata } from "./types";

export const getActivityHierarchy = (activity: Activity): ActivityHierarchyMetadata | null => activity.metadata?.hierarchy ?? null;

export const isHierarchyRoot = (activity: Activity) => getActivityHierarchy(activity)?.level === "root";
export const isHierarchyCategory = (activity: Activity) => getActivityHierarchy(activity)?.level === "category";
export const isHierarchyEvent = (activity: Activity) => getActivityHierarchy(activity)?.level === "event";
export const isHierarchyContainer = (activity: Activity) => isHierarchyRoot(activity) || isHierarchyCategory(activity);

export const getHierarchyChildren = (activities: Activity[], parentActivityId: string) =>
  activities.filter((activity) => getActivityHierarchy(activity)?.parentActivityId === parentActivityId);

export const getHierarchyParent = (activities: Activity[], activity: Activity) => {
  const parentId = getActivityHierarchy(activity)?.parentActivityId;
  return parentId ? activities.find((candidate) => candidate.id === parentId) ?? null : null;
};

export const getHierarchyRoot = (activities: Activity[], activity: Activity) => {
  const rootId = getActivityHierarchy(activity)?.rootActivityId;
  return rootId ? activities.find((candidate) => candidate.id === rootId) ?? null : null;
};

export const getHierarchyPath = (activities: Activity[], activity: Activity) => {
  const hierarchy = getActivityHierarchy(activity);
  if (!hierarchy) return [activity];
  const root = getHierarchyRoot(activities, activity);
  const parent = getHierarchyParent(activities, activity);
  return [root, parent, activity].filter((item, index, list): item is Activity => Boolean(item) && list.indexOf(item) === index);
};

export const getTopLevelActivities = (activities: Activity[]) =>
  activities.filter((activity) => {
    const hierarchy = getActivityHierarchy(activity);
    return !hierarchy || hierarchy.level === "root";
  });
