import { parseBeautyStartParam } from "../beauty/beautyPublicSlug";

let consumedBeautyFocusKey = "";

const beautyFocusKey = (pathname: string, search: string, slug: string) =>
  `${pathname.replace(/\/+$/, "")}|${search}|${slug}`;

export const beautyDeepLinkSlug = (pathname: string, search: string) => {
  const normalizedPath = pathname.replace(/\/+$/, "");
  const pathMatch = normalizedPath.match(/^\/(?:beauty|master)\/([^/]+)(?:\/(?:ru|uk|cs|en))?$/i);
  if (pathMatch?.[1]) return parseBeautyStartParam(decodeURIComponent(pathMatch[1]));
  if (normalizedPath !== "/services" && normalizedPath !== "/masters") return "";
  return parseBeautyStartParam(new URLSearchParams(search).get("beauty"));
};

export const pendingBeautyDeepLinkFocusSlug = (pathname: string, search: string) => {
  const slug = beautyDeepLinkSlug(pathname, search);
  if (!slug) return "";
  return consumedBeautyFocusKey === beautyFocusKey(pathname, search, slug) ? "" : slug;
};

export const markBeautyDeepLinkFocusHandled = (pathname: string, search: string, slug: string) => {
  if (!slug) return;
  consumedBeautyFocusKey = beautyFocusKey(pathname, search, slug);
};

export const beautyDeepLinkSelector = (slug: string) =>
  `[data-beauty-slug="${slug}"] .services-professional-main`;

export const clearBeautyDeepLink = (pathname: string, search: string, hash: string) => {
  const params = new URLSearchParams(search);
  params.delete("beauty");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
};
