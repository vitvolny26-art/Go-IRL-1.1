import { getCurrentDisplayName, getCurrentUserKey } from "../authSession";
import { useAppStore } from "../store";
import type { Activity } from "../types";

export type ServiceBookingStatus = "pending" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show";

export type ServiceBooking = {
  id: string;
  profileId: string;
  professionalName: string;
  serviceName: string;
  clientUserKey: string;
  clientName: string;
  clientContact: string;
  contactBeforeConfirmation: boolean;
  date: string;
  time: string;
  durationMinutes: number;
  priceCzk: number;
  currency: "CZK";
  publicLocation: string;
  status: ServiceBookingStatus;
  createdAt: string;
};

export type CreateServiceBookingInput = Omit<ServiceBooking, "id" | "clientUserKey" | "status" | "createdAt">;

const bookingsKey = "go-irl-services-bookings-v3";
const legacyBookingsKey = "go-irl-services-bookings-v2";
const changedEvent = "go-irl-services-bookings-changed";
const activityPrefix = "service-booking:";

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const readRaw = (key: string): unknown[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeBooking = (value: unknown): ServiceBooking | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.profileId !== "string" || typeof item.date !== "string" || typeof item.time !== "string") return null;
  const status: ServiceBookingStatus = ["pending", "confirmed", "declined", "cancelled", "completed", "no_show"].includes(String(item.status))
    ? item.status as ServiceBookingStatus
    : "pending";
  return {
    id: item.id,
    profileId: item.profileId,
    professionalName: typeof item.professionalName === "string" ? item.professionalName : "Professional",
    serviceName: typeof item.serviceName === "string" ? item.serviceName : "Service",
    clientUserKey: typeof item.clientUserKey === "string" ? item.clientUserKey : getCurrentUserKey(),
    clientName: typeof item.clientName === "string" && item.clientName.trim() ? item.clientName : getCurrentDisplayName("GO IRL User"),
    clientContact: typeof item.clientContact === "string" && item.clientContact.trim() ? item.clientContact : "Telegram",
    contactBeforeConfirmation: item.contactBeforeConfirmation === true,
    date: item.date,
    time: item.time,
    durationMinutes: typeof item.durationMinutes === "number" ? item.durationMinutes : 60,
    priceCzk: typeof item.priceCzk === "number" ? item.priceCzk : 0,
    currency: "CZK",
    publicLocation: typeof item.publicLocation === "string" ? item.publicLocation : "Olomouc",
    status,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
  };
};

export const listServiceBookings = (): ServiceBooking[] => {
  if (typeof localStorage === "undefined") return [];
  const current = readRaw(bookingsKey).map(normalizeBooking).filter((item): item is ServiceBooking => Boolean(item));
  if (current.length) return current;

  const migrated = readRaw(legacyBookingsKey).map(normalizeBooking).filter((item): item is ServiceBooking => Boolean(item));
  if (migrated.length) localStorage.setItem(bookingsKey, JSON.stringify(migrated));
  return migrated;
};

const writeBookings = (bookings: ServiceBooking[]) => {
  localStorage.setItem(bookingsKey, JSON.stringify(bookings));
  window.dispatchEvent(new CustomEvent(changedEvent));
};

export const createServiceBooking = (input: CreateServiceBookingInput): ServiceBooking => {
  const booking: ServiceBooking = {
    ...input,
    clientName: input.clientName.trim() || getCurrentDisplayName("GO IRL User"),
    clientContact: input.clientContact.trim(),
    id: uid(),
    clientUserKey: getCurrentUserKey(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  writeBookings([...listServiceBookings(), booking]);
  return booking;
};

export const updateServiceBookingStatus = (id: string, status: ServiceBookingStatus) => {
  writeBookings(listServiceBookings().map((booking) => booking.id === id ? { ...booking, status } : booking));
};

export const subscribeServiceBookings = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === bookingsKey || event.key === legacyBookingsKey) listener();
  };
  window.addEventListener(changedEvent, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changedEvent, listener);
    window.removeEventListener("storage", onStorage);
  };
};

const localized = (value: string) => ({ ru: value, uk: value, cs: value, en: value , pl: value, sk: value});

const bookingActivity = (booking: ServiceBooking): Activity => {
  const memberStatus = booking.status === "confirmed" || booking.status === "completed" ? "joined" : "pending";
  return {
    id: `${activityPrefix}${booking.id}`,
    type: "custom",
    categoryId: "creativity",
    activity: localized(booking.serviceName),
    title: localized(booking.professionalName),
    description: localized(`${booking.serviceName} · ${booking.date} · ${booking.time}`),
    date: booking.date,
    time: booking.time,
    cityId: "olomouc",
    address: booking.publicLocation,
    price: booking.priceCzk,
    capacity: 1,
    participants: memberStatus === "joined" ? 1 : 0,
    members: [{ userKey: booking.clientUserKey, name: booking.clientName, status: memberStatus }],
    organizer: booking.professionalName,
    organizerKey: `service-professional:${booking.profileId}`,
    visibility: "private",
    metadata: { custom: { serviceBooking: true, bookingId: booking.id, durationMinutes: booking.durationMinutes, status: booking.status, contactBeforeConfirmation: booking.contactBeforeConfirmation } },
  };
};

let bridgeInstalled = false;
let syncing = false;
let scheduled = false;

const arraysEqual = (left: string[], right: string[]) => left.length === right.length && left.every((item, index) => item === right[index]);

export const syncServiceBookingsToAppStore = () => {
  if (typeof window === "undefined" || syncing) return;
  const state = useAppStore.getState();
  const userKey = getCurrentUserKey();
  const bookings = listServiceBookings().filter((booking) => booking.clientUserKey === userKey);
  const synthetic = bookings.map(bookingActivity);
  const regularActivities = state.activities.filter((activity) => !activity.id.startsWith(activityPrefix));
  const regularPending = state.pendingIds.filter((id) => !id.startsWith(activityPrefix));
  const regularJoined = state.joinedIds.filter((id) => !id.startsWith(activityPrefix));
  const pending = bookings.filter((booking) => booking.status === "pending").map((booking) => `${activityPrefix}${booking.id}`);
  const joined = bookings.filter((booking) => booking.status === "confirmed" || booking.status === "completed").map((booking) => `${activityPrefix}${booking.id}`);
  const nextActivities = [...regularActivities, ...synthetic];
  const nextPending = [...regularPending, ...pending];
  const nextJoined = [...regularJoined, ...joined];
  const currentSyntheticIds = state.activities.filter((activity) => activity.id.startsWith(activityPrefix)).map((activity) => activity.id);
  const nextSyntheticIds = synthetic.map((activity) => activity.id);

  if (arraysEqual(currentSyntheticIds, nextSyntheticIds) && arraysEqual(state.pendingIds, nextPending) && arraysEqual(state.joinedIds, nextJoined)) return;
  syncing = true;
  useAppStore.setState({ activities: nextActivities, pendingIds: nextPending, joinedIds: nextJoined });
  syncing = false;
};

const scheduleSync = () => {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    syncServiceBookingsToAppStore();
  }, 0);
};

const installBridge = () => {
  if (bridgeInstalled || typeof window === "undefined") return;
  bridgeInstalled = true;
  subscribeServiceBookings(scheduleSync);
  useAppStore.subscribe((state, previous) => {
    if (!syncing && (state.activities !== previous.activities || state.loading !== previous.loading)) scheduleSync();
  });
  scheduleSync();
  window.setTimeout(scheduleSync, 1200);
};

installBridge();

export const serviceBookingStorage = { bookingsKey, legacyBookingsKey, changedEvent } as const;
