import type { Activity } from "./types";

export const buildActivityCopySeed = (activity: Activity) => ({
  categoryId: activity.categoryId,
  activity: { ...activity.activity },
  title: { ...activity.title },
  description: { ...activity.description },
  cityId: activity.cityId,
  address: activity.address,
  locationUrl: activity.locationUrl,
  participantNote: activity.participantNote,
  price: activity.price,
  capacity: activity.capacity,
  visibility: activity.visibility,
  metadata: activity.metadata?.sport ? { sport: { ...activity.metadata.sport } } : undefined,
});

export type ActivityCopySeed = ReturnType<typeof buildActivityCopySeed>;
