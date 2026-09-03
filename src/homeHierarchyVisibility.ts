import { getActivityHierarchy } from "./activityHierarchy";
import { useAppStore } from "./store";
import type { Activity } from "./types";

export const getHomeHiddenHierarchyActivityIds = (activities: Activity[]) => new Set(
  activities
    .filter((activity) => {
      const hierarchy = getActivityHierarchy(activity);
      return hierarchy && hierarchy.level !== "root";
    })
    .map((activity) => activity.id),
);

const cardActivityId = (card: HTMLElement) =>
  card.querySelector<HTMLElement>("[data-activity-id]")?.dataset.activityId?.trim() || "";

export const applyHomeHierarchyCardVisibility = () => {
  const { activities, view } = useAppStore.getState();
  const hiddenIds = view === "home" ? getHomeHiddenHierarchyActivityIds(activities) : new Set<string>();

  document.querySelectorAll<HTMLElement>("article.unified-event-card").forEach((card) => {
    const activityId = cardActivityId(card);
    const shouldHide = Boolean(activityId && hiddenIds.has(activityId));

    if (shouldHide) {
      card.hidden = true;
      card.dataset.homeHierarchyHidden = "true";
      return;
    }

    if (card.dataset.homeHierarchyHidden === "true") {
      card.hidden = false;
      delete card.dataset.homeHierarchyHidden;
    }
  });
};
