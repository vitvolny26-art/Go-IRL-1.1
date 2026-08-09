import { webAuthCallbackPath } from "./auth/webAuthFlow";
import { parseBeautyStartParam } from "./beauty/beautyPublicSlug";
import { consumeLaunchSurfaceRequest } from "./launchNavigation";

export type LaunchSurface = "launch" | "app";

type LaunchLocation = {
  pathname: string;
  hash: string;
  search: string;
  telegramStartParam?: string;
};

type StoredTrustedSession = {
  accessToken?: string;
  expiresAt?: number;
  source?: string;
  user?: { userKey?: string };
};

const trustedSessionStorageKey = "go-irl-trusted-session-v2";

const hasFreshTrustedBrowserSession = () => {
  if (typeof window === "undefined") return false;
  try {
    const session = JSON.parse(window.sessionStorage.getItem(trustedSessionStorageKey) || "null") as StoredTrustedSession | null;
    return Boolean(
      session?.accessToken
      && session.user?.userKey
      && (session.source === "trusted-telegram" || session.source === "trusted-provider")
      && Number(session.expiresAt) > Math.floor(Date.now() / 1000) + 60,
    );
  } catch {
    return false;
  }
};

const isCanonicalWebGuest = (telegramStartParam?: string) =>
  typeof window !== "undefined"
  && window.location.hostname === "go-irl.fun"
  && !telegramStartParam
  && !window.Telegram?.WebApp?.initData
  && !hasFreshTrustedBrowserSession();

export const resolveLaunchSurface = ({
  pathname,
  hash,
  search,
  telegramStartParam,
}: LaunchLocation): LaunchSurface => {
  const normalizedPath = pathname.replace(/\/+$/, "");
  if (normalizedPath === webAuthCallbackPath) return "app";
  if (isCanonicalWebGuest(telegramStartParam)) return "launch";

  const startParam = telegramStartParam || new URLSearchParams(search).get("startapp") || "";
  const beautySlug = parseBeautyStartParam(startParam);
  if (beautySlug) {
    if (typeof window !== "undefined" && normalizedPath !== "/services") {
      const target = new URL("/services", window.location.origin);
      target.searchParams.set("beauty", beautySlug);
      window.history.replaceState(null, "", `${target.pathname}${target.search}`);
    }
    return "app";
  }
  if (normalizedPath !== "") return "app";
  if (consumeLaunchSurfaceRequest()) return "launch";
  if (startParam) return "app";
  if (hash === "#activities" || hash === "#services") return "app";
  return "launch";
};
