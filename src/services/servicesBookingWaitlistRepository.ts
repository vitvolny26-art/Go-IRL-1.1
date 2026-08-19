import { initializeTrustedAuth, isBrowserMockMode } from "../authSession";
import { supabase } from "../supabase";
import type { Language } from "../types";
import { pragueLocalDateTimeToIso } from "./servicesBookingMutationRepository";

export type ServiceWaitlistSource = "server" | "unavailable";
export type ServiceWaitlistStatus = "active" | "cancelled" | "booked";

export type ServiceWaitlistableSnapshot = {
  slotsByDate: Record<string, string[]>;
  source: ServiceWaitlistSource;
};

export type ServiceWaitlistEntry = {
  id: string;
  profileId: string;
  serviceId: string;
  status: ServiceWaitlistStatus;
  date: string;
  time: string;
  slotStart: string;
  durationMinutes: number;
  bufferMinutes: number;
  serviceName: string;
  publicLocation: string;
  notificationCount: number;
  lastNotifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ServiceWaitlistSnapshot = {
  entries: ServiceWaitlistEntry[];
  source: ServiceWaitlistSource;
};

export type JoinServiceWaitlistResultCode =
  | "joined"
  | "existing"
  | "slot_available"
  | "slot_unavailable"
  | "already_booked"
  | "unavailable";

export type JoinServiceWaitlistInput = {
  profileId: string;
  serviceId: string;
  date: string;
  time: string;
  idempotencyKey: string;
};

export type JoinServiceWaitlistResult = {
  result: JoinServiceWaitlistResultCode;
  source: ServiceWaitlistSource;
  waitlistId?: string;
  waitlistStatus?: string;
  slotStart?: string;
  updatedAt?: string;
};

export type CancelServiceWaitlistResult =
  | "changed"
  | "stale"
  | "not_found"
  | "invalid_state"
  | "unavailable";

type WaitlistRpcError = { code?: string; message?: string } | null;
type WaitlistRpcClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: WaitlistRpcError }>;
};

type WaitlistableRow = { slot_start?: unknown };
type JoinWaitlistRow = {
  result?: unknown;
  waitlist_id?: unknown;
  waitlist_status?: unknown;
  slot_start?: unknown;
  updated_at?: unknown;
};
type MyWaitlistRow = {
  waitlist_id?: unknown;
  profile_id?: unknown;
  service_id?: unknown;
  waitlist_status?: unknown;
  slot_start?: unknown;
  duration_minutes?: unknown;
  buffer_minutes?: unknown;
  service_name?: unknown;
  public_location?: unknown;
  notification_count?: unknown;
  last_notified_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};
type CancelWaitlistRow = {
  result?: unknown;
  waitlist_id?: unknown;
  waitlist_status?: unknown;
  updated_at?: unknown;
};

type WaitlistDependencies = {
  client?: WaitlistRpcClient;
  browserMock?: boolean;
  initializeAuth?: () => Promise<{ source?: string } | null>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const joinResultCodes = new Set<Exclude<JoinServiceWaitlistResultCode, "unavailable">>([
  "joined",
  "existing",
  "slot_available",
  "slot_unavailable",
  "already_booked",
]);
const waitlistStatuses = new Set<ServiceWaitlistStatus>(["active", "cancelled", "booked"]);
const cancelResultCodes = new Set<Exclude<CancelServiceWaitlistResult, "unavailable">>([
  "changed",
  "stale",
  "not_found",
  "invalid_state",
]);

const isMissingRpc = (error: WaitlistRpcError) => error?.code === "PGRST202"
  || Boolean(error?.message?.includes("Could not find the function"));
const isServerIdentifier = (value: string) => uuidPattern.test(value);
const isTrustedIdentity = (identity: { source?: string } | null) =>
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

const unavailableSnapshot = (): ServiceWaitlistableSnapshot => ({ slotsByDate: {}, source: "unavailable" });
const unavailableListSnapshot = (): ServiceWaitlistSnapshot => ({ entries: [], source: "unavailable" });

export const createServiceWaitlistIdempotencyKey = () => {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `beauty-wait:${random}`;
};

export const loadServiceWaitlistableSlots = async (
  profileId: string,
  serviceId: string,
  fromDate: string,
  toDate: string,
  dependencies: WaitlistDependencies = {},
): Promise<ServiceWaitlistableSnapshot> => {
  if (dependencies.browserMock ?? isBrowserMockMode()) return unavailableSnapshot();
  if (!isServerIdentifier(profileId) || !isServerIdentifier(serviceId)) return unavailableSnapshot();

  const identity = await (dependencies.initializeAuth || initializeTrustedAuth)();
  if (!isTrustedIdentity(identity)) return unavailableSnapshot();

  const client = dependencies.client || (supabase as unknown as WaitlistRpcClient);
  const response = await client.rpc("go_irl_list_beauty_waitlistable_slots", {
    p_profile_id: profileId,
    p_service_id: serviceId,
    p_from_date: fromDate,
    p_to_date: toDate,
  });

  if (response.error) {
    if (isMissingRpc(response.error)) return unavailableSnapshot();
    throw response.error;
  }

  const slotsByDate: Record<string, string[]> = {};
  const rows = Array.isArray(response.data) ? response.data as WaitlistableRow[] : [];
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

export const joinServiceWaitlist = async (
  input: JoinServiceWaitlistInput,
  dependencies: WaitlistDependencies = {},
): Promise<JoinServiceWaitlistResult> => {
  if (dependencies.browserMock ?? isBrowserMockMode()) return { result: "unavailable", source: "unavailable" };
  if (!isServerIdentifier(input.profileId) || !isServerIdentifier(input.serviceId)) {
    return { result: "unavailable", source: "unavailable" };
  }

  const identity = await (dependencies.initializeAuth || initializeTrustedAuth)();
  if (!isTrustedIdentity(identity)) return { result: "unavailable", source: "unavailable" };

  const client = dependencies.client || (supabase as unknown as WaitlistRpcClient);
  const response = await client.rpc("go_irl_join_beauty_waitlist", {
    p_profile_id: input.profileId,
    p_service_id: input.serviceId,
    p_starts_at: pragueLocalDateTimeToIso(input.date, input.time),
    p_idempotency_key: input.idempotencyKey,
  });

  if (response.error) {
    if (isMissingRpc(response.error)) return { result: "unavailable", source: "unavailable" };
    throw response.error;
  }

  const row = (Array.isArray(response.data) ? response.data[0] : response.data) as JoinWaitlistRow | undefined;
  const result = String(row?.result || "") as Exclude<JoinServiceWaitlistResultCode, "unavailable">;
  if (!joinResultCodes.has(result)) throw new Error("Unexpected Beauty waitlist RPC result");

  return {
    result,
    source: "server",
    waitlistId: typeof row?.waitlist_id === "string" ? row.waitlist_id : undefined,
    waitlistStatus: typeof row?.waitlist_status === "string" ? row.waitlist_status : undefined,
    slotStart: typeof row?.slot_start === "string" ? row.slot_start : undefined,
    updatedAt: typeof row?.updated_at === "string" ? row.updated_at : undefined,
  };
};

export const loadMyServiceWaitlist = async (
  language: Language,
  dependencies: WaitlistDependencies = {},
): Promise<ServiceWaitlistSnapshot> => {
  if (dependencies.browserMock ?? isBrowserMockMode()) return unavailableListSnapshot();
  const identity = await (dependencies.initializeAuth || initializeTrustedAuth)();
  if (!isTrustedIdentity(identity)) return unavailableListSnapshot();

  const client = dependencies.client || (supabase as unknown as WaitlistRpcClient);
  const response = await client.rpc("go_irl_list_my_beauty_waitlist", { p_limit: 100 });
  if (response.error) {
    if (isMissingRpc(response.error)) return unavailableListSnapshot();
    throw response.error;
  }

  const rows = Array.isArray(response.data) ? response.data as MyWaitlistRow[] : [];
  const entries = rows.map((row): ServiceWaitlistEntry | null => {
    const id = typeof row.waitlist_id === "string" ? row.waitlist_id : "";
    const profileId = typeof row.profile_id === "string" ? row.profile_id : "";
    const serviceId = typeof row.service_id === "string" ? row.service_id : "";
    const slotStart = typeof row.slot_start === "string" ? row.slot_start : "";
    const local = slotStart ? pragueDateTime(slotStart) : null;
    const status = String(row.waitlist_status || "") as ServiceWaitlistStatus;
    if (!id || !profileId || !serviceId || !slotStart || !local || !waitlistStatuses.has(status)) return null;
    return {
      id,
      profileId,
      serviceId,
      status,
      date: local.date,
      time: local.time,
      slotStart,
      durationMinutes: Number.isFinite(Number(row.duration_minutes)) ? Number(row.duration_minutes) : 0,
      bufferMinutes: Number.isFinite(Number(row.buffer_minutes)) ? Number(row.buffer_minutes) : 0,
      serviceName: localizedServiceName(row.service_name, language),
      publicLocation: typeof row.public_location === "string" ? row.public_location.trim() : "",
      notificationCount: Number.isFinite(Number(row.notification_count)) ? Number(row.notification_count) : 0,
      ...(typeof row.last_notified_at === "string" ? { lastNotifiedAt: row.last_notified_at } : {}),
      createdAt: typeof row.created_at === "string" ? row.created_at : slotStart,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : slotStart,
    };
  }).filter((entry): entry is ServiceWaitlistEntry => Boolean(entry));

  return { entries, source: "server" };
};

export const cancelServiceWaitlist = async (
  entry: Pick<ServiceWaitlistEntry, "id" | "updatedAt">,
  dependencies: WaitlistDependencies = {},
): Promise<CancelServiceWaitlistResult> => {
  if (dependencies.browserMock ?? isBrowserMockMode()) return "unavailable";
  const identity = await (dependencies.initializeAuth || initializeTrustedAuth)();
  if (!isTrustedIdentity(identity)) return "unavailable";

  const client = dependencies.client || (supabase as unknown as WaitlistRpcClient);
  const response = await client.rpc("go_irl_cancel_my_beauty_waitlist", {
    p_waitlist_id: entry.id,
    p_expected_updated_at: entry.updatedAt,
  });
  if (response.error) {
    if (isMissingRpc(response.error)) return "unavailable";
    throw response.error;
  }

  const row = (Array.isArray(response.data) ? response.data[0] : response.data) as CancelWaitlistRow | undefined;
  const result = String(row?.result || "") as Exclude<CancelServiceWaitlistResult, "unavailable">;
  return cancelResultCodes.has(result) ? result : "unavailable";
};

export const servicesBookingWaitlistRepositoryInternals = {
  isMissingRpc,
  isServerIdentifier,
  isTrustedIdentity,
  pragueDateTime,
  localizedServiceName,
} as const;
