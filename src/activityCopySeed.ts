import type { Activity, Language, NewActivity } from "./types";

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

/** Reuse event configuration while removing lifecycle-specific identifiers and participants. */
export const buildQuickRepeatInput = (source: Activity, date: string, time: string, language: Language): NewActivity => {
  const { telegramCommunity: _telegramCommunity, recurringInvite: _recurringInvite, initialInviteUserKeys: _initialInviteUserKeys, hierarchy: _hierarchy, ...reusableMetadata } = source.metadata || {};
  void _telegramCommunity;
  void _recurringInvite;
  void _initialInviteUserKeys;
  void _hierarchy;
  return {
    type: source.type || (source.categoryId === "sport" ? "sport" : "custom"),
    categoryId: source.categoryId,
    activityText: source.activity[language],
    titleText: source.title[language],
    descriptionText: source.description[language],
    date,
    time,
    cityId: source.cityId,
    address: source.address,
    locationUrl: source.locationUrl,
    participantNote: source.participantNote,
    price: source.price,
    capacity: source.capacity,
    visibility: source.visibility,
    metadata: reusableMetadata,
  };
};
