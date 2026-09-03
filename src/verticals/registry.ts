import { isHierarchyContainer } from "../activityHierarchy";
import { isSportActivity, sportRecommendationEngine } from "./sport";
import { genericRecommendationEngine, type RecommendationEngine } from "../recommendations";
import type { Activity, ActivityType } from "../types";

export type ActivityExperienceType = "sport" | "generic";

export type ActivityExperienceModule = {
  type: ActivityExperienceType;
  activityTypes: ActivityType[];
  label: string;
  isMatch: (activity: Activity) => boolean;
  recommendationEngine: RecommendationEngine;
};

export const supportedFutureVerticals: ActivityType[] = ["dating", "friends", "food", "travel", "culture"];

export const activityRendererRegistry: Record<ActivityExperienceType, ActivityExperienceModule> = {
  sport: {
    type: "sport",
    activityTypes: ["sport"],
    label: "Sport",
    isMatch: (activity) => !isHierarchyContainer(activity) && isSportActivity(activity),
    recommendationEngine: sportRecommendationEngine,
  },
  generic: {
    type: "generic",
    activityTypes: ["custom", "culture", "local", "friends", "food", "travel"],
    label: "Generic",
    isMatch: () => true,
    recommendationEngine: genericRecommendationEngine,
  },
};

export const ActivityRendererRegistry = activityRendererRegistry;

export function resolveActivityExperience(activity: Activity) {
  if (activityRendererRegistry.sport.isMatch(activity)) return activityRendererRegistry.sport;
  return activityRendererRegistry.generic;
}
