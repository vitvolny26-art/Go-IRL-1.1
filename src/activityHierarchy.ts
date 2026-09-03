import type { Activity, ActivityHierarchyMetadata } from "./types";

export type ActivityHierarchySection = {
  category: Activity;
  events: Activity[];
};

export type ActivityHierarchyProgram = {
  root: Activity;
  sections: ActivityHierarchySection[];
  ungroupedEvents: Activity[];
  eventCount: number;
};

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

export const getHierarchyProgram = (activities: Activity[], rootActivityId: string): ActivityHierarchyProgram | null => {
  const root = activities.find((activity) => activity.id === rootActivityId && isHierarchyRoot(activity));
  if (!root) return null;

  const rootChildren = getHierarchyChildren(activities, root.id).filter(
    (activity) => getActivityHierarchy(activity)?.rootActivityId === root.id,
  );
  const categories = rootChildren.filter(isHierarchyCategory);
  const sections = categories.map((category) => ({
    category,
    events: getHierarchyChildren(activities, category.id).filter((activity) => {
      const hierarchy = getActivityHierarchy(activity);
      return hierarchy?.level === "event" && hierarchy.rootActivityId === root.id;
    }),
  }));
  const ungroupedEvents = rootChildren.filter(isHierarchyEvent);

  return {
    root,
    sections,
    ungroupedEvents,
    eventCount: sections.reduce((total, section) => total + section.events.length, ungroupedEvents.length),
  };
};
