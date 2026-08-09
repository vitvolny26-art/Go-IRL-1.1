import { getCurrentAuthSession, initializeTrustedAuth, refreshTrustedAuth } from "../authSession";

export type AdminRoute = "login" | "panel" | "denied" | null;
type FetchLike = typeof fetch;
type AuthIdentityLike = { accessToken?: string; source?: string } | null;
type AdminSessionAuthDependencies = {
  current: () => AuthIdentityLike;
  initialize: () => Promise<AuthIdentityLike>;
  refresh: () => Promise<AuthIdentityLike>;
};

const productionAuthDependencies: AdminSessionAuthDependencies = {
  current: getCurrentAuthSession,
  initialize: initializeTrustedAuth,
  refresh: refreshTrustedAuth,
};

export const resolveAdminRoute = (pathname: string): AdminRoute => {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/admin/login") return "login";
  if (normalized === "/admin/access-denied") return "denied";
  if (normalized === "/admin" || normalized.startsWith("/admin/")) return "panel";
  return null;
};

export const adminRedirectForAuthorization = (authorized: boolean) =>
  authorized ? "/admin" : "/admin/access-denied";

const requestAdminSessionResponse = async (accessToken: string, fetcher: FetchLike) => {
  if (!accessToken.trim()) return null;
  try {
    return await fetcher("/api/admin/session", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return null;
  }
};

export const requestAdminSession = async (accessToken: string, fetcher: FetchLike = fetch) =>
  Boolean((await requestAdminSessionResponse(accessToken, fetcher))?.ok);

export const verifyCurrentAdminSession = async (
  fetcher: FetchLike = fetch,
  auth: AdminSessionAuthDependencies = productionAuthDependencies,
) => {
  const identity = await auth.initialize();
  const session = identity && "source" in identity && identity.source === "trusted-telegram"
    ? identity
    : auth.current();
  if (!session?.accessToken) return false;

  const initialResponse = await requestAdminSessionResponse(session.accessToken, fetcher);
  if (initialResponse?.ok) return true;
  if (initialResponse?.status !== 401 && initialResponse?.status !== 403) return false;

  const refreshed = await auth.refresh();
  return refreshed?.source === "trusted-telegram" && refreshed.accessToken
    ? requestAdminSession(refreshed.accessToken, fetcher)
    : false;
};
