import { getCurrentUserKey, initializeTrustedAuth, isBrowserMockMode } from "../../authSession";
import { supabase } from "../../supabase";

export type CinemaPlannedItem = {
  cityId: string;
  movieId: string;
  date: string;
  savedAt: string;
};

export type CinemaPlannedSource = "server" | "browser-local" | "local-fallback";
export type CinemaPlannedSnapshot = { items: CinemaPlannedItem[]; source: CinemaPlannedSource };

type RpcError = { code?: string; message?: string } | null;
type RpcClient = {
  rpc: (functionName: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError }>;
};

type PlannedRow = {
  city_id?: unknown;
  movie_id?: unknown;
  planned_date?: unknown;
  saved_at?: unknown;
};

type Dependencies = {
  client?: RpcClient;
  browserMock?: boolean;
  initializeAuth?: () => Promise<{ source?: string } | null>;
};

const storagePrefix = "go-irl-city-posters-cinema-planned-v2";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isMissingRpc = (error: RpcError) => error?.code === "PGRST202"
  || Boolean(error?.message?.includes("Could not find the function"));
const isTrustedIdentity = (identity: { source?: string } | null) =>
  identity?.source === "trusted-telegram" || identity?.source === "trusted-provider";

const storageKey = () => `${storagePrefix}:${getCurrentUserKey()}`;

const sanitize = (value: unknown): CinemaPlannedItem[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, CinemaPlannedItem>();
  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const row = item as Partial<CinemaPlannedItem>;
    const cityId = String(row.cityId || "").trim();
    const movieId = String(row.movieId || "").trim();
    const date = String(row.date || "");
    if (!cityId || !uuidPattern.test(movieId) || !datePattern.test(date)) return;
    const savedAt = typeof row.savedAt === "string" && row.savedAt ? row.savedAt : new Date().toISOString();
    unique.set(`${cityId}:${movieId}`, { cityId, movieId, date, savedAt });
  });
  return [...unique.values()].sort((left, right) => left.date.localeCompare(right.date));
};

const readLocal = () => {
  if (typeof window === "undefined") return [];
  try {
    return sanitize(JSON.parse(window.localStorage.getItem(storageKey()) || "[]"));
  } catch {
    return [];
  }
};

const writeLocal = (items: CinemaPlannedItem[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(), JSON.stringify(sanitize(items)));
};

const localSnapshot = (source: Exclude<CinemaPlannedSource, "server">): CinemaPlannedSnapshot => ({
  items: readLocal(),
  source,
});

const normalizeServerRows = (value: unknown): CinemaPlannedItem[] => {
  if (!Array.isArray(value)) return [];
  return sanitize(value.map((rowValue) => {
    const row = rowValue as PlannedRow;
    return {
      cityId: String(row.city_id || ""),
      movieId: String(row.movie_id || ""),
      date: String(row.planned_date || ""),
      savedAt: typeof row.saved_at === "string" ? row.saved_at : new Date().toISOString(),
    };
  }));
};

export async function loadCinemaPlanned(dependencies: Dependencies = {}): Promise<CinemaPlannedSnapshot> {
  const browserMock = dependencies.browserMock ?? isBrowserMockMode();
  if (browserMock) return localSnapshot("browser-local");

  const initializeAuth = dependencies.initializeAuth || initializeTrustedAuth;
  const identity = await initializeAuth();
  if (!isTrustedIdentity(identity)) return localSnapshot("local-fallback");

  const client = dependencies.client || (supabase as unknown as RpcClient);
  const response = await client.rpc("go_irl_list_my_cinema_plans");
  if (response.error) {
    if (isMissingRpc(response.error)) return localSnapshot("local-fallback");
    throw response.error;
  }
  const items = normalizeServerRows(response.data);
  writeLocal(items);
  return { items, source: "server" };
}

export async function setCinemaPlannedDate(
  cityId: string,
  movieId: string,
  date: string,
  dependencies: Dependencies = {},
): Promise<CinemaPlannedSource> {
  if (!cityId.trim() || !uuidPattern.test(movieId) || !datePattern.test(date)) throw new Error("invalid_cinema_plan");
  const browserMock = dependencies.browserMock ?? isBrowserMockMode();
  if (browserMock) {
    const remaining = readLocal().filter((item) => !(item.cityId === cityId && item.movieId === movieId));
    writeLocal([...remaining, { cityId, movieId, date, savedAt: new Date().toISOString() }]);
    return "browser-local";
  }

  const initializeAuth = dependencies.initializeAuth || initializeTrustedAuth;
  const identity = await initializeAuth();
  if (!isTrustedIdentity(identity)) {
    const remaining = readLocal().filter((item) => !(item.cityId === cityId && item.movieId === movieId));
    writeLocal([...remaining, { cityId, movieId, date, savedAt: new Date().toISOString() }]);
    return "local-fallback";
  }

  const client = dependencies.client || (supabase as unknown as RpcClient);
  const response = await client.rpc("go_irl_set_my_cinema_plan", {
    p_city_id: cityId.trim(),
    p_movie_id: movieId,
    p_planned_date: date,
  });
  if (response.error) {
    if (isMissingRpc(response.error)) {
      const remaining = readLocal().filter((item) => !(item.cityId === cityId && item.movieId === movieId));
      writeLocal([...remaining, { cityId, movieId, date, savedAt: new Date().toISOString() }]);
      return "local-fallback";
    }
    throw response.error;
  }
  const snapshot = await loadCinemaPlanned({ ...dependencies, client, initializeAuth: async () => identity });
  writeLocal(snapshot.items);
  return "server";
}

export async function removeCinemaPlanned(
  cityId: string,
  movieId: string,
  dependencies: Dependencies = {},
): Promise<CinemaPlannedSource> {
  if (!cityId.trim() || !uuidPattern.test(movieId)) throw new Error("invalid_cinema_plan");
  const browserMock = dependencies.browserMock ?? isBrowserMockMode();
  if (browserMock) {
    writeLocal(readLocal().filter((item) => !(item.cityId === cityId && item.movieId === movieId)));
    return "browser-local";
  }

  const initializeAuth = dependencies.initializeAuth || initializeTrustedAuth;
  const identity = await initializeAuth();
  if (!isTrustedIdentity(identity)) {
    writeLocal(readLocal().filter((item) => !(item.cityId === cityId && item.movieId === movieId)));
    return "local-fallback";
  }

  const client = dependencies.client || (supabase as unknown as RpcClient);
  const response = await client.rpc("go_irl_remove_my_cinema_plan", {
    p_city_id: cityId.trim(),
    p_movie_id: movieId,
  });
  if (response.error) {
    if (isMissingRpc(response.error)) {
      writeLocal(readLocal().filter((item) => !(item.cityId === cityId && item.movieId === movieId)));
      return "local-fallback";
    }
    throw response.error;
  }
  const snapshot = await loadCinemaPlanned({ ...dependencies, client, initializeAuth: async () => identity });
  writeLocal(snapshot.items);
  return "server";
}

export const cinemaPlannedInternals = { sanitize, isMissingRpc, isTrustedIdentity, storagePrefix } as const;
