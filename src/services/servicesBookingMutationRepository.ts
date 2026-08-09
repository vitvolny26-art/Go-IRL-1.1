import { initializeTrustedAuth, isBrowserMockMode } from "../authSession";
import { supabase } from "../supabase";
import {
  createServiceBooking,
  type CreateServiceBookingInput,
  type ServiceBooking,
} from "./servicesBookingRepository";

export type ServiceAvailabilitySource = "server" | "browser-local" | "local-fallback";

export type ServiceAvailabilitySnapshot = {
  slotsByDate: Record<string, string[]>;
  source: ServiceAvailabilitySource;
};

export type SubmitServiceBookingInput = CreateServiceBookingInput & {
  serviceId: string;
  idempotencyKey: string;
};

export type SubmitServiceBookingResultCode =
  | "created"
  | "existing"
  | "slot_taken"
  | "slot_blocked"
  | "slot_unavailable"
  | "service_unavailable"
  | "local_created";

export type SubmitServiceBookingResult = {
  result: SubmitServiceBookingResultCode;
  source: ServiceAvailabilitySource;
  bookingId?: string;
  bookingStatus?: string;
  startsAt?: string;
  updatedAt?: string;
};

type BookingRpcError = { code?: string; message?: string } | null;
type BookingRpcClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: BookingRpcError }>;
};

type AvailabilityRow = {
  slot_start?: unknown;
};

type CreateBookingRow = {
  result?: unknown;
  booking_id?: unknown;
  booking_status?: unknown;
  starts_at?: unknown;
  updated_at?: unknown;
};

type AvailabilityDependencies = {
  client?: BookingRpcClient;
  browserMock?: boolean;
};

type SubmitDependencies = AvailabilityDependencies & {
  initializeAuth?: () => Promise<{ source?: string } | null>;
  createLocal?: (input: CreateServiceBookingInput) => ServiceBooking;
};

const serverResultCodes = new Set<Exclude<SubmitServiceBookingResultCode, "local_created">>([
  "created",
  "existing",
  "slot_taken",
  "slot_blocked",
  "slot_unavailable",
  "service_unavailable",
]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isMissingRpc = (error: BookingRpcError) => error?.code === "PGRST202"
  || Boolean(error?.message?.includes("Could not find the function"));

const isServerIdentifier = (value: string) => uuidPattern.test(value);
const isTrustedBookingIdentity = (identity: { source?: string } | null) =>
  identity?.source === "trusted-telegram" || identity?.source === "trusted-provider";

const pragueDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
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
  const localDate = `${part("year")}-${part("month")}-${part("day")}`;
  const localTime = `${part("hour")}:${part("minute")}`;
  return localDate.length === 10 && localTime.length === 5
    ? { date: localDate, time: localTime }
    : null;
};

const praguePartsAsUtc = (instant: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value || 0);
  return Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
};

export const pragueLocalDateTimeToIso = (date: string, time: string) => {
  const dateParts = date.split("-").map(Number);
  const timeParts = time.split(":").map(Number);
  if (dateParts.length !== 3 || timeParts.length !== 2 || [...dateParts, ...timeParts].some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid Beauty booking date or time");
  }

  const [year, month, day] = dateParts;
  const [hour, minute] = timeParts;
  const localTarget = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = localTarget;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = praguePartsAsUtc(new Date(instant)) - instant;
    const corrected = localTarget - offset;
    if (corrected === instant) break;
    instant = corrected;
  }

  const iso = new Date(instant).toISOString();
  const roundTrip = pragueDateTime(iso);
  if (!roundTrip || roundTrip.date !== date || roundTrip.time !== time) {
    throw new Error("Beauty booking time does not exist in Europe/Prague");
  }
  return iso;
};

export const createServiceBookingIdempotencyKey = () => {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `beauty:${random}`;
};

const localAvailability = (source: Exclude<ServiceAvailabilitySource, "server">): ServiceAvailabilitySnapshot => ({
  slotsByDate: {},
  source,
});

export const loadServiceAvailability = async (
  profileId: string,
  serviceId: string,
  fromDate: string,
  toDate: string,
  dependencies: AvailabilityDependencies = {},
): Promise<ServiceAvailabilitySnapshot> => {
  const browserMock = dependencies.browserMock ?? isBrowserMockMode();
  if (browserMock) return localAvailability("browser-local");
  if (!isServerIdentifier(profileId) || !isServerIdentifier(serviceId)) return localAvailability("local-fallback");

  const client = dependencies.client || (supabase as unknown as BookingRpcClient);
  const response = await client.rpc("go_irl_list_public_beauty_availability", {
    p_profile_id: profileId,
    p_service_id: serviceId,
    p_from_date: fromDate,
    p_to_date: toDate,
  });

  if (response.error) {
    if (isMissingRpc(response.error)) return localAvailability("local-fallback");
    throw response.error;
  }

  const slotsByDate: Record<string, string[]> = {};
  const rows = Array.isArray(response.data) ? response.data as AvailabilityRow[] : [];
  rows.forEach((row) => {
    if (typeof row.slot_start !== "string") return;
    const local = pragueDateTime(row.slot_start);
    if (!local) return;
    const slots = slotsByDate[local.date] || [];
    if (!slots.includes(local.time)) slots.push(local.time);
    slotsByDate[local.date] = slots;
  });
  Object.values(slotsByDate).forEach((slots) => slots.sort());
  return { slotsByDate, source: "server" };
};

const createLocalResult = (
  source: Exclude<ServiceAvailabilitySource, "server">,
  input: SubmitServiceBookingInput,
  createLocal: (booking: CreateServiceBookingInput) => ServiceBooking,
): SubmitServiceBookingResult => {
  const localInput: CreateServiceBookingInput = {
    profileId: input.profileId,
    professionalName: input.professionalName,
    serviceName: input.serviceName,
    clientName: input.clientName,
    clientContact: input.clientContact,
    contactBeforeConfirmation: input.contactBeforeConfirmation,
    date: input.date,
    time: input.time,
    durationMinutes: input.durationMinutes,
    priceCzk: input.priceCzk,
    currency: input.currency,
    publicLocation: input.publicLocation,
  };
  const booking = createLocal(localInput);
  return {
    result: "local_created",
    source,
    bookingId: booking.id,
    bookingStatus: booking.status,
    startsAt: `${booking.date}T${booking.time}:00`,
    updatedAt: booking.createdAt,
  };
};

export const submitServiceBooking = async (
  input: SubmitServiceBookingInput,
  dependencies: SubmitDependencies = {},
): Promise<SubmitServiceBookingResult> => {
  const browserMock = dependencies.browserMock ?? isBrowserMockMode();
  const createLocal = dependencies.createLocal || createServiceBooking;
  if (browserMock) return createLocalResult("browser-local", input, createLocal);
  if (!isServerIdentifier(input.profileId) || !isServerIdentifier(input.serviceId)) {
    return createLocalResult("local-fallback", input, createLocal);
  }

  const initializeAuth = dependencies.initializeAuth || initializeTrustedAuth;
  const identity = await initializeAuth();
  if (!isTrustedBookingIdentity(identity)) {
    return createLocalResult("local-fallback", input, createLocal);
  }

  const client = dependencies.client || (supabase as unknown as BookingRpcClient);
  const response = await client.rpc("go_irl_create_beauty_booking", {
    p_profile_id: input.profileId,
    p_service_id: input.serviceId,
    p_starts_at: pragueLocalDateTimeToIso(input.date, input.time),
    p_client_name: input.clientName.trim(),
    p_client_contact: input.clientContact.trim(),
    p_idempotency_key: input.idempotencyKey,
  });

  if (response.error) {
    if (isMissingRpc(response.error)) return createLocalResult("local-fallback", input, createLocal);
    throw response.error;
  }

  const row = Array.isArray(response.data) ? response.data[0] as CreateBookingRow | undefined : undefined;
  const result = String(row?.result || "") as Exclude<SubmitServiceBookingResultCode, "local_created">;
  if (!serverResultCodes.has(result)) throw new Error("Unexpected Beauty booking RPC result");

  return {
    result,
    source: "server",
    bookingId: typeof row?.booking_id === "string" ? row.booking_id : undefined,
    bookingStatus: typeof row?.booking_status === "string" ? row.booking_status : undefined,
    startsAt: typeof row?.starts_at === "string" ? row.starts_at : undefined,
    updatedAt: typeof row?.updated_at === "string" ? row.updated_at : undefined,
  };
};

export const serviceBookingMutationRepositoryInternals = {
  isMissingRpc,
  isServerIdentifier,
  isTrustedBookingIdentity,
  pragueDateTime,
} as const;
