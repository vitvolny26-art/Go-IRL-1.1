import { initializeTrustedAuth, isBrowserMockMode } from "../authSession";
import { supabase } from "../supabase";

export type BookingConfirmationMode = "manual" | "automatic";
export type BookingConfirmationModeSource = "server" | "browser-local" | "local-fallback";
export type BookingConfirmationModeSnapshot = { mode: BookingConfirmationMode; source: BookingConfirmationModeSource };

type RpcError = { code?: string; message?: string } | null;
type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError }> };
type Dependencies = { client?: RpcClient; browserMock?: boolean; initializeAuth?: () => Promise<{ source?: string } | null> };

const isMissingRpc = (error: RpcError) => error?.code === "PGRST202"
  || Boolean(error?.message?.includes("Could not find the function"));
const normalizeMode = (value: unknown): BookingConfirmationMode => value === "automatic" ? "automatic" : "manual";
const rowFrom = (data: unknown) => {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row as Record<string, unknown> : undefined;
};

export const loadBookingConfirmationMode = async (dependencies: Dependencies = {}): Promise<BookingConfirmationModeSnapshot> => {
  if (dependencies.browserMock ?? isBrowserMockMode()) return { mode: "manual", source: "browser-local" };
  const identity = await (dependencies.initializeAuth || initializeTrustedAuth)();
  if (identity?.source !== "trusted-telegram" && identity?.source !== "trusted-provider") {
    return { mode: "manual", source: "local-fallback" };
  }
  const result = await (dependencies.client || (supabase as unknown as RpcClient)).rpc("go_irl_get_my_beauty_confirmation_mode");
  if (result.error) {
    if (isMissingRpc(result.error)) return { mode: "manual", source: "local-fallback" };
    throw result.error;
  }
  return { mode: normalizeMode(rowFrom(result.data)?.confirmation_mode), source: "server" };
};

export const saveBookingConfirmationMode = async (
  mode: BookingConfirmationMode,
  dependencies: Dependencies = {},
): Promise<BookingConfirmationModeSnapshot> => {
  if (dependencies.browserMock ?? isBrowserMockMode()) return { mode: "manual", source: "browser-local" };
  const identity = await (dependencies.initializeAuth || initializeTrustedAuth)();
  if (identity?.source !== "trusted-telegram" && identity?.source !== "trusted-provider") {
    return { mode: "manual", source: "local-fallback" };
  }
  const result = await (dependencies.client || (supabase as unknown as RpcClient)).rpc(
    "go_irl_set_my_beauty_confirmation_mode",
    { p_confirmation_mode: mode },
  );
  if (result.error) {
    if (isMissingRpc(result.error)) return { mode: "manual", source: "local-fallback" };
    throw result.error;
  }
  return { mode: normalizeMode(rowFrom(result.data)?.confirmation_mode), source: "server" };
};
