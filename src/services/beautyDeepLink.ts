import { parseBeautyStartParam } from "../beauty/beautyPublicSlug";

export const beautyDeepLinkSlug = (pathname: string, search: string) => {
  const normalizedPath = pathname.replace(/\/+$/, "");
  const pathMatch = normalizedPath.match(/^\/(?:beauty|master)\/([^/]+)(?:\/(?:ru|uk|cs|en))?$/i);
  if (pathMatch?.[1]) return parseBeautyStartParam(decodeURIComponent(pathMatch[1]));
  if (normalizedPath !== "/services" && normalizedPath !== "/masters") return "";
  return parseBeautyStartParam(new URLSearchParams(search).get("beauty"));
};

export const beautyDeepLinkSelector = (slug: string) =>
  `[data-beauty-slug="${slug}"] .services-professional-main`;

export const clearBeautyDeepLink = (pathname: string, search: string, hash: string) => {
  const params = new URLSearchParams(search);
  params.delete("beauty");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
};
