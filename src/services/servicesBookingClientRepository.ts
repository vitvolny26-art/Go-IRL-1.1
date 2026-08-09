import { initializeTrustedAuth, isBrowserMockMode } from "../authSession";
import { supabase } from "../supabase";
import type { Language } from "../types";
import { listServiceBookings, updateServiceBookingStatus, type ServiceBooking } from "./servicesBookingRepository";
import { loadProfessionalDirectory, type ServicesProfessional } from "./servicesProfessionalDirectory";

export type ClientServiceBookingStatus = ServiceBooking["status"] | "expired";
export type ClientServiceBookingSource = "server" | "browser-local" | "local-fallback";

export type ClientServiceBooking = {
  id: string;
  profileId: string;
  serviceId: string;
  professionalName: string;
  serviceName: string;
  status: ClientServiceBookingStatus;
  date: string;
  time: string;
  startsAt: string;
  durationMinutes: number;
  priceCzk: number;
  currency: "CZK";
  publicLocation: string;
  exactAddress?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientServiceBookingSnapshot = {
  bookings: ClientServiceBooking[];
  source: ClientServiceBookingSource;
};

export type CancelClientServiceBookingResult =
  | "cancelled"
  | "stale"
  | "policy_required"
  | "not_found"
  | "local_cancelled";

type BookingRpcError = { code?: string; message?: string } | null;
type BookingRpcClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: BookingRpcError }>;
};

type ServerBookingRow = {
  booking_id?: unknown;
  profile_id?: unknown;
  service_id?: unknown;
  booking_status?: unknown;
  starts_at?: unknown;
  service_name?: unknown;
  duration_minutes?: unknown;
  price_czk?: unknown;
  currency?: unknown;
  public_location?: unknown;
  exact_address?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type RepositoryDependencies = {
  client?: BookingRpcClient;
  browserMock?: boolean;
  initializeAuth?: () => Promise<{ source?: string } | null>;
  listLocal?: () => ServiceBooking[];
  loadDirectory?: (cityId: string, language: Language) => Promise<ServicesProfessional[]>;
};

const bookingStatuses = new Set<ClientServiceBookingStatus>([
  "pending",
  "confirmed",
  "declined",
  "cancelled",
  "completed",
  "no_show",
  "expired",
]);

const fallbackProfessionalName: Record<Language, string> = {
  ru: "Мастер Beauty",
  uk: "Майстер Beauty",
  cs: "Beauty profesionál",
  en: "Beauty professional",
};

const isMissingRpc = (error: BookingRpcError) => error?.code === "PGRST202"
  || Boolean(error?.message?.includes("Could not find the function"));

const isTrustedBookingIdentity = (identity: { source?: string } | null) =>
  identity?.source === "trusted-telegram" || identity?.source === "trusted-provider";

const localizedServiceName = (value: unknown, language: Language) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Beauty service";
  const record = value as Record<string, unknown>;
  const preferred = record[language];
  if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
  const english = record.en;
  if (typeof english === "string" && english.trim()) return english.trim();
  const first = Object.values(record).find((item) => typeof item === "string" && item.trim());
  return typeof first === "string" ? first.trim() : "Beauty service";
};

const pragueDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: value.slice(0, 10), time: value.slice(11, 16) };
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
};

const normalizeStatus = (value: unknown): ClientServiceBookingStatus => {
  const status = String(value || "pending") as ClientServiceBookingStatus;
  return bookingStatuses.has(status) ? status : "pending";
};

const mapLocalBooking = (booking: ServiceBooking): ClientServiceBooking => ({
  id: booking.id,
  profileId: booking.profileId,
  serviceId: `${booking.profileId}:${booking.serviceName}:${booking.durationMinutes}:${booking.priceCzk}`,
  professionalName: booking.professionalName,
  serviceName: booking.serviceName,
  status: booking.status,
  date: booking.date,
  time: booking.time,
  startsAt: `${booking.date}T${booking.time}:00`,
  durationMinutes: booking.durationMinutes,
  priceCzk: booking.priceCzk,
  currency: booking.currency,
  publicLocation: booking.publicLocation,
  createdAt: booking.createdAt,
  updatedAt: booking.createdAt,
});

const professionalLookup = (professionals: ServicesProfessional[]) => {
  const exact = new Map(professionals.map((item) => [`${item.profileId}:${item.serviceId}`, item.displayName]));
  const byProfile = new Map(professionals.map((item) => [item.profileId, item.displayName]));
  return { exact, byProfile };
};

const mapServerBooking = (
  row: ServerBookingRow,
  language: Language,
  professionals: ReturnType<typeof professionalLookup>,
): ClientServiceBooking | null => {
  const id = typeof row.booking_id === "string" ? row.booking_id : "";
  const profileId = typeof row.profile_id === "string" ? row.profile_id : "";
  const serviceId = typeof row.service_id === "string" ? row.service_id : "";
  const startsAt = typeof row.starts_at === "string" ? row.starts_at : "";
  if (!id || !profileId || !serviceId || !startsAt) return null;
  const local = pragueDateTime(startsAt);
  const exactAddress = typeof row.exact_address === "string" && row.exact_address.trim()
    ? row.exact_address.trim()
    : undefined;
  return {
    id,
    profileId,
    serviceId,
    professionalName: professionals.exact.get(`${profileId}:${serviceId}`)
      || professionals.byProfile.get(profileId)
      || fallbackProfessionalName[language],
    serviceName: localizedServiceName(row.service_name, language),
    status: normalizeStatus(row.booking_status),
    date: local.date,
    time: local.time,
    startsAt,
    durationMinutes: Number.isFinite(Number(row.duration_minutes)) ? Number(row.duration_minutes) : 60,
    priceCzk: Number.isFinite(Number(row.price_czk)) ? Number(row.price_czk) : 0,
    currency: "CZK",
    publicLocation: typeof row.public_location === "string" ? row.public_location.trim() : "Olomouc",
    exactAddress,
    createdAt: typeof row.created_at === "string" ? row.created_at : startsAt,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : startsAt,
  };
};

const localSnapshot = (
  source: Exclude<ClientServiceBookingSource, "server">,
  listLocal: () => ServiceBooking[],
): ClientServiceBookingSnapshot => ({
  bookings: listLocal().map(mapLocalBooking).sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
  source,
});

export const loadClientServiceBookings = async (
  language: Language,
  dependencies: RepositoryDependencies = {},
): Promise<ClientServiceBookingSnapshot> => {
  const browserMock = dependencies.browserMock ?? isBrowserMockMode();
  const listLocal = dependencies.listLocal || listServiceBookings;
  if (browserMock) return localSnapshot("browser-local", listLocal);

  const initializeAuth = dependencies.initializeAuth || initializeTrustedAuth;
  const identity = await initializeAuth();
  if (!isTrustedBookingIdentity(identity)) return localSnapshot("local-fallback", listLocal);

  const client = dependencies.client || (supabase as unknown as BookingRpcClient);
  const result = await client.rpc("go_irl_list_my_beauty_bookings", { p_limit: 100 });
  if (result.error) {
    if (isMissingRpc(result.error)) return localSnapshot("local-fallback", listLocal);
    throw result.error;
  }

  const loadDirectory = dependencies.loadDirectory || loadProfessionalDirectory;
  const professionals = await loadDirectory("olomouc", language).catch(() => []);
  const lookup = professionalLookup(professionals);
  const rows = Array.isArray(result.data) ? result.data as ServerBookingRow[] : [];
  const bookings = rows
    .map((row) => mapServerBooking(row, language, lookup))
    .filter((booking): booking is ClientServiceBooking => Boolean(booking))
    .sort((left, right) => right.startsAt.localeCompare(left.startsAt));
  return { bookings, source: "server" };
};

export const cancelClientServiceBooking = async (
  booking: ClientServiceBooking,
  dependencies: Pick<RepositoryDependencies, "client" | "browserMock" | "initializeAuth"> & {
    updateLocal?: typeof updateServiceBookingStatus;
  } = {},
): Promise<CancelClientServiceBookingResult> => {
  const updateLocal = dependencies.updateLocal || updateServiceBookingStatus;
  const cancelLocal = (): CancelClientServiceBookingResult => {
    updateLocal(booking.id, "cancelled");
    return "local_cancelled";
  };

  const browserMock = dependencies.browserMock ?? isBrowserMockMode();
  if (browserMock) return cancelLocal();

  const initializeAuth = dependencies.initializeAuth || initializeTrustedAuth;
  const identity = await initializeAuth();
  if (!isTrustedBookingIdentity(identity)) return cancelLocal();

  const client = dependencies.client || (supabase as unknown as BookingRpcClient);
  const response = await client.rpc("go_irl_cancel_my_beauty_booking", {
    p_booking_id: booking.id,
    p_expected_updated_at: booking.updatedAt,
  });
  if (response.error) {
    if (isMissingRpc(response.error)) throw new Error("Beauty booking cancellation RPC is unavailable");
    throw response.error;
  }

  const row = Array.isArray(response.data)
    ? response.data[0] as { result?: unknown } | undefined
    : undefined;
  const result = String(row?.result || "");
  if (!["cancelled", "stale", "policy_required", "not_found"].includes(result)) {
    throw new Error("Unexpected Beauty booking cancellation RPC result");
  }
  return result as CancelClientServiceBookingResult;
};

export const serviceBookingClientRepositoryInternals = {
  isMissingRpc,
  isTrustedBookingIdentity,
  localizedServiceName,
  mapLocalBooking,
  pragueDateTime,
} as const;
