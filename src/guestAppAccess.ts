import { resolveActivityEntryIntent } from "./auth/activityEntryIntent";

const guestCatalogPaths = new Set(["/activities", "/services", "/masters"]);
const beautyGuestPathPattern = /^\/(?:beauty|master)\/[^/]+(?:\/(?:ru|uk|cs|en))?$/i;

const normalizePath = (pathname: string) => pathname.replace(/\/+$/, "") || "/";

export const isPublicGuestServicesRoute = (pathname: string) => {
  const normalized = normalizePath(pathname);
  return normalized === "/services"
    || normalized === "/masters"
    || beautyGuestPathPattern.test(normalized);
};

export const isPublicGuestAppRoute = (pathname: string) => {
  const normalized = normalizePath(pathname);
  return guestCatalogPaths.has(normalized)
    || beautyGuestPathPattern.test(normalized)
    || Boolean(resolveActivityEntryIntent({ pathname: normalized }));
};

export const guestActivityCatalogCityIds = (
  pathname: string,
  selectedCityId: string,
  availableCityIds: string[],
) => {
  if (!resolveActivityEntryIntent({ pathname: normalizePath(pathname) })) {
    return [selectedCityId];
  }

  return [selectedCityId, ...availableCityIds.filter((cityId) => cityId !== selectedCityId)];
};

export const guestProtectedActionSelector = [
  ".card-join",
  ".main-action",
  ".activity-chat-toggle",
  ".detail-members-toggle",
  ".sport-card-participants-chip",
  ".runtime-participants-chip",
  ".organizer-avatar-action",
  ".organizer-detail-action",
  ".member-profile-action",
  ".event-request-alert",
  ".request-actions button",
  ".membership-leave-action",
  ".danger-action",
  ".service-free-slots-badge",
  ".service-meta-date-item",
  ".services-professional-actions .secondary",
  ".services-professional-actions .primary",
  ".service-reminder-action button",
].join(",");
