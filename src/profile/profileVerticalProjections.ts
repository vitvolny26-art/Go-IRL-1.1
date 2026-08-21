import type { MyGoIrlProjection } from "./myGoIrlProjection";
import type { ProfileVerticalPreferences, ServicePreferenceId } from "./profileVerticalPreferences";

export type ProfileActivityProjectionSummary = {
  upcomingCreatedCount: number;
  upcomingJoinedCount: number;
  pendingRequestsCount: number;
  pastCount: number;
};

export type ProfileServicesProjectionSummary = {
  preferenceIds: ServicePreferenceId[];
};

export type ProfileVerticalProjectionSummary = {
  activities: ProfileActivityProjectionSummary;
  services: ProfileServicesProjectionSummary;
};

export const buildProfileVerticalProjectionSummary = (
  activities: MyGoIrlProjection,
  preferences: ProfileVerticalPreferences,
): ProfileVerticalProjectionSummary => ({
  activities: {
    upcomingCreatedCount: activities.upcomingCreated.length,
    upcomingJoinedCount: activities.upcomingJoined.length,
    pendingRequestsCount: activities.pendingRequests.length,
    pastCount: activities.past.length,
  },
  services: {
    preferenceIds: [...preferences.services],
  },
});
