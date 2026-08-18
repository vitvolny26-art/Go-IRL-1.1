export type PublicSeo = {
  title: string;
  description: string;
  canonicalUrl: string;
  language: "ru" | "uk" | "cs" | "en";
};

const origin = "https://go-irl.fun";
const languagePattern = "ru|uk|cs|en";

const normalizePath = (pathname: string) => pathname.replace(/\/+$/, "") || "/";

export const resolvePublicSeo = (pathname: string): PublicSeo | null => {
  const normalized = normalizePath(pathname);
  if (normalized === "/masters") {
    return {
      title: "Мастера GO IRL — услуги и запись в Оломоуце",
      description: "Найдите мастера в GO IRL, посмотрите услуги, цены и свободное время для записи в Оломоуце.",
      canonicalUrl: `${origin}/masters`,
      language: "ru",
    };
  }

  const match = normalized.match(new RegExp(`^/master/([^/]+)(?:/(${languagePattern}))?$`, "i"));
  if (!match?.[1]) return null;
  const language = (match[2]?.toLowerCase() || "ru") as PublicSeo["language"];
  return {
    title: "Мастер GO IRL — профиль, услуги и запись",
    description: "Публичный профиль мастера GO IRL: услуги, цены, портфолио и доступное время для записи.",
    canonicalUrl: `${origin}/master/${encodeURIComponent(decodeURIComponent(match[1]))}`,
    language,
  };
};

const setMeta = (selector: string, attribute: "content" | "href", value: string) => {
  const element = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
  element?.setAttribute(attribute, value);
};

export const applyPublicSeo = (pathname: string) => {
  const seo = resolvePublicSeo(pathname);
  if (!seo) return false;

  document.title = seo.title;
  document.documentElement.lang = seo.language;
  setMeta('meta[name="description"]', "content", seo.description);
  setMeta('link[rel="canonical"]', "href", seo.canonicalUrl);
  setMeta('meta[property="og:title"]', "content", seo.title);
  setMeta('meta[property="og:description"]', "content", seo.description);
  setMeta('meta[property="og:url"]', "content", seo.canonicalUrl);
  setMeta('meta[name="twitter:title"]', "content", seo.title);
  setMeta('meta[name="twitter:description"]', "content", seo.description);
  return true;
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  applyPublicSeo(window.location.pathname);
}
