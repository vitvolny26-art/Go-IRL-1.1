const localePathSuffix = "(?:/(?:ru|uk|cs|en|pl|sk))?";
const uuidLikeSegment = "[^/?#]+";

export const normalizeAppPath = (pathname: string) => pathname.replace(/\/+$/, "") || "/";

export const isServicesDomainPath = (pathname: string) => {
  const normalized = normalizeAppPath(pathname);
  return normalized === "/services" || new RegExp(`^/beauty/${uuidLikeSegment}${localePathSuffix}$`, "i").test(normalized);
};

export const isOffersDomainPath = (pathname: string) => normalizeAppPath(pathname) === "/offers";

export const isActivitiesDomainPath = (pathname: string) => {
  const normalized = normalizeAppPath(pathname);
  return normalized === "/activities"
    || new RegExp(`^/e/${uuidLikeSegment}${localePathSuffix}$`, "i").test(normalized)
    || new RegExp(`^/join/${uuidLikeSegment}${localePathSuffix}$`, "i").test(normalized);
};

export const shouldShowInternalHeader = ({
  pathname,
  selected,
  view,
}: {
  pathname: string;
  selected: boolean;
  view: string;
}) => selected
  || view !== "home"
  || isActivitiesDomainPath(pathname)
  || isServicesDomainPath(pathname)
  || isOffersDomainPath(pathname);
