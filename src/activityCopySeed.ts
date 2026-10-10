import type { Activity, ActivityMetadata } from "./types";

const reusableActivityMetadata = (metadata: ActivityMetadata | undefined) => {
  if (!metadata) return undefined;
  const reusable: ActivityMetadata = {
    ...(metadata.sport ? { sport: { ...metadata.sport } } : {}),
    ...(metadata.mushroomPicking ? {
      mushroomPicking: {
        ...metadata.mushroomPicking,
        equipment: [...metadata.mushroomPicking.equipment],
      },
    } : {}),
  };
  return reusable.sport || reusable.mushroomPicking ? reusable : undefined;
};

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
  metadata: reusableActivityMetadata(activity.metadata),
});

export type ActivityCopySeed = ReturnType<typeof buildActivityCopySeed>;
