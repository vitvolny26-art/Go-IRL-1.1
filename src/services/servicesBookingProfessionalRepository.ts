import { initializeTrustedAuth, isBrowserMockMode } from "../authSession";
import { supabase } from "../supabase";
import type { Language } from "../types";
import {
  listServiceBookings,
  updateServiceBookingStatus,
  type ServiceBooking,
  type ServiceBookingStatus,
} from "./servicesBookingRepository";

export type ProfessionalServiceBookingSource = "server" | "browser-local" | "local-fallback";
export type ProfessionalServiceBookingStatus = ServiceBookingStatus | "expired";
export type ProfessionalBookingTransitionResult =
  | "changed"
  | "stale"
  | "not_found"
  | "invalid_transition"
  | "unavailable";

export type ProfessionalServiceBooking = {
  id: string;
  profileId: string;
  serviceId: string;
  clientUserKey: string;
  clientName: string;
  clientContact: string;
  serviceName: string;
  status: ProfessionalServiceBookingStatus;
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

export type ProfessionalServiceBookingSnapshot = {
  bookings: ProfessionalServiceBooking[];
  source: ProfessionalServiceBookingSource;
  profileId?: string;
};

export type TransitionProfessionalServiceBookingInput = {
  bookingId: string;
  expectedStatus: ServiceBookingStatus;
  expectedUpdatedAt: string;
  targetStatus: ServiceBookingStatus;
  source: ProfessionalServiceBookingSource;
};

export type TransitionProfessionalServiceBookingOutput = {
  result: ProfessionalBookingTransitionResult;
  bookingId: string;
  bookingStatus: ProfessionalServiceBookingStatus;
  updatedAt: string;
};

type BookingRpcError = { code?: string; message?: string } | null;
type BookingRpcClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: BookingRpcError }>;
};

type ServerProfileRow = { profile_id?: unknown };
type ServerBookingRow = {
  booking_id?: unknown;
  profile_id?: unknown;
  service_id?: unknown;
  client_user_key?: unknown;
  client_name?: unknown;
  client_contact?: unknown;
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

type ServerTransitionRow = {
  result?: unknown;
  booking_id?: unknown;
  booking_status?: unknown;
  updated_at?: unknown;
};

type RepositoryDependencies = {
  client?: BookingRpcClient;
  browserMock?: boolean;
  initializeAuth?: () => Promise<{ source?: string } | null>;
  listLocal?: () => ServiceBooking[];
  updateLocal?: (id: string, status: ServiceBookingStatus) => void;
};

const profileRpcNames = ["get_my_beauty_profile_v3", "get_my_beauty_profile_v2", "get_my_beauty_profile"] as const;
const bookingStatuses = new Set<ProfessionalServiceBookingStatus>([
  "pending",
  "confirmed",
  "declined",
  "cancelled",
  "completed",
  "no_show",
  "expired",
]);
const transitionResults = new Set<ProfessionalBookingTransitionResult>([
  "changed",
  "stale",
  "not_found",
  "invalid_transition",
  "unavailable",
]);

const isMissingRpc = (error: BookingRpcError) => error?.code === "PGRST202"
  || Boolean(error?.message?.includes("Could not find the function"));

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

const normalizeStatus = (value: unknown): ProfessionalServiceBookingStatus => {
  const status = String(value || "pending") as ProfessionalServiceBookingStatus;
  return bookingStatuses.has(status) ? status : "pending";
};

const mapLocalBooking = (booking: ServiceBooking): ProfessionalServiceBooking => ({
  id: booking.id,
  profileId: booking.profileId,
  serviceId: `${booking.profileId}:${booking.serviceName}:${booking.durationMinutes}:${booking.priceCzk}`,
  clientUserKey: booking.clientUserKey,
  clientName: booking.clientName,
  clientContact: booking.clientContact,
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

const mapServerBooking = (row: ServerBookingRow, language: Language): ProfessionalServiceBooking | null => {
  const id = typeof row.booking_id === "string" ? row.booking_id : "";
  const profileId = typeof row.profile_id === "string" ? row.profile_id : "";
  const serviceId = typeof row.service_id === "string" ? row.service_id : "";
  const startsAt = typeof row.starts_at === "string" ? row.starts_at : "";
  if (!id || !profileId || !serviceId || !startsAt) return null;
  const local = pragueDateTime(startsAt);
  return {
    id,
    profileId,
    serviceId,
    clientUserKey: typeof row.client_user_key === "string" ? row.client_user_key : "",
    clientName: typeof row.client_name === "string" && row.client_name.trim() ? row.client_name.trim() : "GO IRL client",
    clientContact: typeof row.client_contact === "string" ? row.client_contact.trim() : "",
    serviceName: localizedServiceName(row.service_name, language),
    status: normalizeStatus(row.booking_status),
    date: local.date,
    time: local.time,
    startsAt,
    durationMinutes: Number.isFinite(Number(row.duration_minutes)) ? Number(row.duration_minutes) : 60,
    priceCzk: Number.isFinite(Number(row.price_czk)) ? Number(row.price_czk) : 0,
    currency: "CZK",
    publicLocation: typeof row.public_location === "string" ? row.public_location.trim() : "Olomouc",
    exactAddress: typeof row.exact_address === "string" && row.exact_address.trim() ? row.exact_address.trim() : undefined,
    createdAt: typeof row.created_at === "string" ? row.created_at : startsAt,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : startsAt,
  };
};

const localSnapshot = (
  source: Exclude<ProfessionalServiceBookingSource, "server">,
  listLocal: () => ServiceBooking[],
): ProfessionalServiceBookingSnapshot => ({
  bookings: listLocal().map(mapLocalBooking).sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
  source,
});

const profileRow = (value: unknown): ServerProfileRow | undefined => {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? row as ServerProfileRow : undefined;
};

const loadOwnedProfileId = async (client: BookingRpcClient) => {
  for (const functionName of profileRpcNames) {
    const result = await client.rpc(functionName);
    if (!result.error) {
      const value = profileRow(result.data)?.profile_id;
      return { profileId: typeof value === "string" && value.trim() ? value.trim() : undefined, missingRpc: false };
    }
    if (!isMissingRpc(result.error)) throw result.error;
  }
  return { profileId: undefined, missingRpc: true };
};

export const loadProfessionalServiceBookings = async (
  language: Language,
  dependencies: RepositoryDependencies = {},
): Promise<ProfessionalServiceBookingSnapshot> => {
  const browserMock = dependencies.browserMock ?? isBrowserMockMode();
  const listLocal = dependencies.listLocal || listServiceBookings;
  if (browserMock) return localSnapshot("browser-local", listLocal);

  const initializeAuth = dependencies.initializeAuth || initializeTrustedAuth;
  const identity = await initializeAuth();
  if (identity?.source !== "trusted-telegram") return localSnapshot("local-fallback", listLocal);

  const client = dependencies.client || (supabase as unknown as BookingRpcClient);
  const ownedProfile = await loadOwnedProfileId(client);
  if (ownedProfile.missingRpc) return localSnapshot("local-fallback", listLocal);
  if (!ownedProfile.profileId) return { bookings: [], source: "server" };

  const result = await client.rpc("go_irl_list_my_beauty_professional_bookings", {
    p_profile_id: ownedProfile.profileId,
    p_limit: 200,
  });
  if (result.error) {
    if (isMissingRpc(result.error)) return localSnapshot("local-fallback", listLocal);
    throw result.error;
  }

  const rows = Array.isArray(result.data) ? result.data as ServerBookingRow[] : [];
  const bookings = rows
    .map((row) => mapServerBooking(row, language))
    .filter((booking): booking is ProfessionalServiceBooking => Boolean(booking))
    .sort((left, right) => right.startsAt.localeCompare(left.startsAt));
  return { bookings, source: "server", profileId: ownedProfile.profileId };
};

export const transitionProfessionalServiceBooking = async (
  input: TransitionProfessionalServiceBookingInput,
  dependencies: RepositoryDependencies = {},
): Promise<TransitionProfessionalServiceBookingOutput> => {
  const updateLocal = dependencies.updateLocal || updateServiceBookingStatus;
  if (input.source !== "server" || (dependencies.browserMock ?? isBrowserMockMode())) {
    updateLocal(input.bookingId, input.targetStatus);
    return {
      result: "changed",
      bookingId: input.bookingId,
      bookingStatus: input.targetStatus,
      updatedAt: new Date().toISOString(),
    };
  }

  const initializeAuth = dependencies.initializeAuth || initializeTrustedAuth;
  const identity = await initializeAuth();
  if (identity?.source !== "trusted-telegram") {
    return {
      result: "unavailable",
      bookingId: input.bookingId,
      bookingStatus: input.expectedStatus,
      updatedAt: input.expectedUpdatedAt,
    };
  }

  const client = dependencies.client || (supabase as unknown as BookingRpcClient);
  const result = await client.rpc("go_irl_transition_beauty_booking", {
    p_booking_id: input.bookingId,
    p_expected_status: input.expectedStatus,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_target_status: input.targetStatus,
  });
  if (result.error) {
    if (isMissingRpc(result.error)) {
      return {
        result: "unavailable",
        bookingId: input.bookingId,
        bookingStatus: input.expectedStatus,
        updatedAt: input.expectedUpdatedAt,
      };
    }
    throw result.error;
  }

  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as ServerTransitionRow | undefined;
  const transitionResult = String(row?.result || "unavailable") as ProfessionalBookingTransitionResult;
  return {
    result: transitionResults.has(transitionResult) ? transitionResult : "unavailable",
    bookingId: typeof row?.booking_id === "string" ? row.booking_id : input.bookingId,
    bookingStatus: normalizeStatus(row?.booking_status || input.expectedStatus),
    updatedAt: typeof row?.updated_at === "string" ? row.updated_at : input.expectedUpdatedAt,
  };
};

export const serviceBookingProfessionalRepositoryInternals = {
  isMissingRpc,
  localizedServiceName,
  mapLocalBooking,
  pragueDateTime,
} as const;
