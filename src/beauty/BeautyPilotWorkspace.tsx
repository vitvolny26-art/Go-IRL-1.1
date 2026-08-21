import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Ban, BellDot, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, CreditCard, House, MessageCircle, Plus, Scissors, UserRound, X, type LucideIcon } from "lucide-react";
import { useAppStore } from "../store";
import type { Language } from "../types";
import {
  loadProfessionalServiceBookings,
  rescheduleProfessionalServiceBooking,
  transitionProfessionalServiceBooking,
  type ProfessionalServiceBooking,
  type ProfessionalServiceBookingSource,
  type ProfessionalServiceBookingStatus,
} from "../services/servicesBookingProfessionalRepository";
import { pragueLocalDateTimeToIso } from "../services/servicesBookingMutationRepository";
import {
  subscribeServiceBookings,
  type ServiceBookingStatus,
} from "../services/servicesBookingRepository";
import type { BeautyWeekday, BeautyWorkspace } from "./beautySetupModel";
import { beautyWorkspaceCopy } from "./beautyWorkspaceCopy";
import "../services/service-activity-card.css";
import "./beauty-workspace-desktop.css";

type Status = ProfessionalServiceBookingStatus;
type Appointment = {
  id: string;
  clientName: string;
  phone: string;
  date: string;
  time: string;
  startsAt?: string;
  durationMinutes?: number;
  serviceName?: string;
  requestedTime?: string;
  contactBeforeConfirmation?: boolean;
  status: Status;
  source: "client" | "professional";
  bookingId?: string;
  bookingSource?: ProfessionalServiceBookingSource;
  updatedAt?: string;
};
type TimeBlock = { id: string; date: string; time: string; label: string };
type PilotData = { appointments: Appointment[]; blocks: TimeBlock[] };
type View = "overview" | "requests" | "appointments" | "page" | "business-card";

const pilotKey = "go-irl-beauty-pilot-v1";
export const resetBeautyPilotWorkspace = () => localStorage.removeItem(pilotKey);
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const appointmentKey = (item: Appointment) => `${item.date}T${item.time}`;
const sortAppointments = (items: Appointment[]) => [...items].sort((left, right) => appointmentKey(left).localeCompare(appointmentKey(right)));
const appointmentLifecycleAvailable = (item: Appointment, now = Date.now()) => {
  const startsAt = item.startsAt
    ? new Date(item.startsAt).getTime()
    : new Date(`${item.date}T${item.time}:00`).getTime();
  if (!Number.isFinite(startsAt)) return false;
  const durationMs = Math.max(item.durationMinutes || 0, 0) * 60 * 1000;
  return startsAt + durationMs <= now;
};
const weekdayKeys: BeautyWeekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const localDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const parseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};
const calendarCells = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1, 12);
  const days = new Date(year, monthNumber, 0, 12).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
  return [
    ...Array.from({ length: mondayOffset }, () => null),
    ...Array.from({ length: days }, (_, index) => localDateKey(new Date(year, monthNumber - 1, index + 1, 12))),
  ];
};
const initialData = (language: Language): PilotData => ({
  appointments: [
    { id: uid(), clientName: "Petra K.", phone: "+420 777 222 333", date: today(), time: "10:30", status: "pending", source: "client" },
    { id: uid(), clientName: "Eva M.", phone: "+420 777 444 555", date: today(), time: "14:30", status: "confirmed", source: "professional" },
  ],
  blocks: [{ id: uid(), date: today(), time: "12:00", label: beautyWorkspaceCopy[language].seedLunch }],
});
const load = (language: Language): PilotData => {
  try {
    const value = JSON.parse(localStorage.getItem(pilotKey) || "null") as PilotData | null;
    return value?.appointments && value?.blocks ? value : initialData(language);
  } catch { return initialData(language); }
};
function NavButton({ active, icon: Icon, label, badge = 0, onClick }: { active: boolean; icon: LucideIcon; label: string; badge?: number; onClick: () => void }) {
  return <button className={active ? "is-active" : ""} type="button" aria-current={active ? "page" : undefined} onClick={onClick}><Icon size={19} /><span>{label}</span>{badge > 0 && <b>{badge > 99 ? "99+" : badge}</b>}</button>;
}

const bookingAppointment = (
  booking: ProfessionalServiceBooking,
  bookingSource: ProfessionalServiceBookingSource,
): Appointment => ({
  id: `service-booking:${booking.id}`,
  bookingId: booking.id,
  bookingSource,
  updatedAt: booking.updatedAt,
  clientName: booking.clientName,
  phone: booking.clientContact,
  serviceName: booking.serviceName,
  date: booking.date,
  time: booking.time,
  startsAt: booking.startsAt,
  durationMinutes: booking.durationMinutes,
  status: booking.status,
  source: "client",
});

type BeautyPilotWorkspaceProps = {
  setup: BeautyWorkspace;
  onEdit: () => void;
  pageEditor?: ReactNode;
  businessCardEditor?: ReactNode;
};

export function BeautyPilotWorkspace({ setup, onEdit, pageEditor, businessCardEditor }: BeautyPilotWorkspaceProps) {
  const language = useAppStore((state) => state.language);
  const text = beautyWorkspaceCopy[language];
  const weekdayLabels = text.weekdays;
  const [data, setData] = useState<PilotData>(() => load(language));
  const [professionalBookings, setProfessionalBookings] = useState<ProfessionalServiceBooking[]>([]);
  const [bookingSource, setBookingSource] = useState<ProfessionalServiceBookingSource>("browser-local");
  const [bookingLoading, setBookingLoading] = useState(true);
  const [bookingError, setBookingError] = useState("");
  const [transitioningId, setTransitioningId] = useState("");
  const [view, setView] = useState<View>("overview");
  const [selected, setSelected] = useState("");
  const [dialog, setDialog] = useState<"appointment" | "block" | "booking" | "reschedule" | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", date: today(), time: "09:00", label: "" });
  const [calendarMonth, setCalendarMonth] = useState(today().slice(0, 7));
  const [calendarDate, setCalendarDate] = useState(today());
  const persist = (next: PilotData) => { setData(next); localStorage.setItem(pilotKey, JSON.stringify(next)); };

  const refreshProfessionalBookings = useCallback(async () => {
    setBookingLoading(true);
    try {
      const snapshot = await loadProfessionalServiceBookings(language);
      setProfessionalBookings(snapshot.bookings);
      setBookingSource(snapshot.source);
      setBookingError("");
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : text.loadBookingsError);
    } finally {
      setBookingLoading(false);
    }
  }, [language, text]);

  useEffect(() => {
    void refreshProfessionalBookings();
    return subscribeServiceBookings(() => { void refreshProfessionalBookings(); });
  }, [refreshProfessionalBookings]);

  const serverBacked = bookingSource === "server";
  const relevantProfessionalBookings = useMemo(() => {
    if (serverBacked) return professionalBookings;
    const serviceNames = new Set(setup.services.map((service) => service.name));
    serviceNames.add(setup.service.name);
    return professionalBookings.filter((booking) => serviceNames.has(booking.serviceName));
  }, [professionalBookings, serverBacked, setup.service.name, setup.services]);
  const allAppointments = useMemo(() => sortAppointments([
    ...(serverBacked ? [] : data.appointments),
    ...relevantProfessionalBookings.map((booking) => bookingAppointment(booking, bookingSource)),
  ]), [bookingSource, data.appointments, relevantProfessionalBookings, serverBacked]);
  const pendingAppointments = useMemo(() => allAppointments.filter((item) => item.status === "pending"), [allAppointments]);
  const upcomingAppointments = useMemo(() => allAppointments.filter((item) => item.status === "confirmed" && item.date >= today()), [allAppointments]);
  const todayAppointments = useMemo(() => allAppointments.filter((item) => item.date === today() && ["pending", "confirmed"].includes(item.status)), [allAppointments]);
  const upcomingBlocks = useMemo(() => serverBacked ? [] : data.blocks.filter((item) => item.date >= today()).sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`)), [data.blocks, serverBacked]);
  const todayBlocks = upcomingBlocks.filter((item) => item.date === today());
  const current = allAppointments.find((item) => item.id === selected);
  const currentLifecycleAvailable = current ? appointmentLifecycleAvailable(current) : false;
  const occupied = new Set([...allAppointments.filter((item) => ["pending", "confirmed"].includes(item.status)).map((item) => `${item.date}:${item.time}`), ...upcomingBlocks.map((item) => `${item.date}:${item.time}`)]);
  const slots = ["09:00", "10:30", "12:00", "14:30", "16:00"];
  const nextAppointment = upcomingAppointments[0];
  const activeServiceCount = setup.services.filter((service) => service.active).length || 1;
  const calendarDays = useMemo(() => calendarCells(calendarMonth), [calendarMonth]);
  const configuredWeekdays = useMemo(() => new Set(setup.availability.weekdays), [setup.availability.weekdays]);
  const calendarAppointments = useMemo(() => allAppointments.filter((item) => item.date === calendarDate && ["pending", "confirmed"].includes(item.status)), [allAppointments, calendarDate]);
  const calendarMonthLabel = useMemo(() => new Intl.DateTimeFormat(text.locale, { month: "long", year: "numeric" }).format(parseDateKey(`${calendarMonth}-01`)), [calendarMonth, text.locale]);
  const isWorkingDate = (date: string) => {
    const weekdayIndex = (parseDateKey(date).getDay() + 6) % 7;
    return configuredWeekdays.has(weekdayKeys[weekdayIndex]);
  };
  const moveCalendarMonth = (delta: number) => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1, 12);
    setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };

  const updateStatus = async (status: ServiceBookingStatus) => {
    if (!current) return;
    if (!current.bookingId) {
      persist({ ...data, appointments: data.appointments.map((item) => item.id === selected ? { ...item, status, requestedTime: undefined } : item) });
      setSelected("");
      return;
    }

    setTransitioningId(current.id);
    setBookingError("");
    try {
      const output = await transitionProfessionalServiceBooking({
        bookingId: current.bookingId,
        expectedStatus: current.status as ServiceBookingStatus,
        expectedUpdatedAt: current.updatedAt || new Date(0).toISOString(),
        targetStatus: status,
        source: current.bookingSource || bookingSource,
      });
      await refreshProfessionalBookings();
      if (output.result === "changed") {
        setSelected("");
      } else if (output.result === "stale") {
        setBookingError(text.staleError);
      } else if (output.result === "invalid_transition") {
        setBookingError(text.invalidTransitionError);
      } else if (output.result === "not_found") {
        setBookingError(text.notFoundError);
        setSelected("");
      } else {
        setBookingError(text.statusServerError);
      }
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : text.statusServerError);
    } finally {
      setTransitioningId("");
    }
  };
  const approveReschedule = () => {
    if (!current?.requestedTime || current.bookingId) return;
    persist({ ...data, appointments: data.appointments.map((item) => item.id === current.id ? { ...item, time: item.requestedTime!, requestedTime: undefined, status: "confirmed" } : item) });
    setSelected("");
  };
  const submit = () => {
    if (serverBacked) {
      setBookingError(text.manualServerUnavailable);
      setDialog(null);
      return;
    }
    if (dialog === "block") {
      if (!form.label.trim() || occupied.has(`${form.date}:${form.time}`)) return;
      persist({ ...data, blocks: [...data.blocks, { id: uid(), date: form.date, time: form.time, label: form.label.trim() }] });
    } else {
      if (!form.name.trim() || !form.phone.trim() || occupied.has(`${form.date}:${form.time}`)) return;
      persist({ ...data, appointments: [...data.appointments, { id: uid(), clientName: form.name.trim(), phone: form.phone.trim(), date: form.date, time: form.time, status: dialog === "appointment" ? "confirmed" : "pending", source: dialog === "appointment" ? "professional" : "client" }] });
    }
    setDialog(null);
    setForm({ name: "", phone: "", date: today(), time: "09:00", label: "" });
  };
  const requestReschedule = async () => {
    if (!current) return;
    const targetDate = form.date || current.date;
    if (!current.bookingId) {
      if (occupied.has(`${targetDate}:${form.time}`)) return;
      persist({ ...data, appointments: data.appointments.map((item) => item.id === current.id ? { ...item, requestedTime: form.time } : item) });
      setDialog(null);
      return;
    }

    setTransitioningId(current.id);
    setBookingError("");
    try {
      const output = await rescheduleProfessionalServiceBooking({
        bookingId: current.bookingId,
        expectedUpdatedAt: current.updatedAt || new Date(0).toISOString(),
        startsAt: pragueLocalDateTimeToIso(targetDate, form.time),
        source: current.bookingSource || bookingSource,
      });
      await refreshProfessionalBookings();
      if (output.result === "changed") {
        setDialog(null);
        setSelected("");
      } else if (output.result === "stale") {
        setBookingError(text.staleError);
      } else if (output.result === "slot_unavailable") {
        setBookingError(text.slotUnavailableError);
      } else if (output.result === "slot_blocked") {
        setBookingError(text.slotBlockedError);
      } else if (output.result === "slot_taken") {
        setBookingError(text.slotTakenError);
      } else if (output.result === "invalid_transition") {
        setBookingError(text.rescheduleInvalidError);
      } else if (output.result === "not_found") {
        setBookingError(text.notFoundError);
        setDialog(null);
        setSelected("");
      } else {
        setBookingError(text.rescheduleServerError);
      }
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : text.rescheduleError);
    } finally {
      setTransitioningId("");
    }
  };
  const calendarDownload = (item: Appointment) => {
    const date = item.date.replaceAll("-", "");
    const start = item.time.replace(":", "") + "00";
    const file = new Blob([`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${date}T${start}\nSUMMARY:${item.serviceName || setup.service.name}\nLOCATION:${setup.profile.exactAddress}\nEND:VEVENT\nEND:VCALENDAR`], { type: "text/calendar" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(file); link.download = "go-irl-beauty.ics"; link.click(); URL.revokeObjectURL(link.href);
  };

  const bookingSyncNotice = bookingLoading
    ? <div className="beauty-note"><span>{text.loadingBookings}</span></div>
    : bookingError
      ? <div className="beauty-errors"><span>{bookingError}</span><button type="button" onClick={() => { void refreshProfessionalBookings(); }}>{text.retry}</button></div>
      : bookingSource === "local-fallback"
        ? <div className="beauty-note"><span>{text.localFallbackNotice}</span></div>
        : bookingSource === "browser-local"
          ? <div className="beauty-note"><span>{text.browserLocalNotice}</span></div>
          : <div className="beauty-note"><span>{text.serverSyncedNotice}</span></div>;

  const appointmentList = (items: Appointment[], emptyText: string) => <div className="beauty-pilot-list">
    {items.map((item) => <button className="beauty-appointment-card" type="button" key={item.id} onClick={() => setSelected(item.id)}>
      <span><b>{item.time}</b><small>{item.date}</small></span>
      <span><strong>{item.clientName}</strong><small>{item.serviceName || setup.service.name}{item.contactBeforeConfirmation ? ` · ${text.contactFirstSuffix}` : ""}</small></span>
      <i className={`status-${item.status}`}>{text.statuses[item.status]}</i>
    </button>)}
    {!items.length && <div className="beauty-workspace-empty">{emptyText}</div>}
  </div>;

  const timeBlocks = (items: TimeBlock[]) => items.map((item) => {
    const label = ["Обед", "Обід", "Oběd", "Lunch"].includes(item.label) ? text.seedLunch : item.label;
    return <div className="beauty-time-block" key={item.id}><Ban size={17} /><span><b>{item.date} · {item.time}</b> · {label}</span><button type="button" aria-label={text.removeBlock} onClick={() => persist({ ...data, blocks: data.blocks.filter((block) => block.id !== item.id) })}><X size={16} /></button></div>;
  });

  const overview = <section className="beauty-workspace-view">
    <div className="beauty-workspace-section-head"><div><span className="beauty-preview-badge">{text.workdayBadge}</span><h2>{text.overview}</h2><p>{text.overviewHint}</p></div><button className="beauty-primary" type="button" disabled={serverBacked} title={serverBacked ? text.manualServerTitle : undefined} onClick={() => setDialog("appointment")}><Plus size={18} />{text.addAppointment}</button></div>
    {bookingSyncNotice}
    <div className="beauty-workspace-summary">
      <button type="button" onClick={() => setView("requests")}><BellDot /><span>{text.newRequests}</span><strong>{pendingAppointments.length}</strong></button>
      <button type="button" onClick={() => setView("appointments")}><CalendarDays /><span>{text.upcomingAppointments}</span><strong>{upcomingAppointments.length}</strong></button>
      <div><Clock3 /><span>{text.today}</span><strong>{todayAppointments.length}</strong></div>
      <div><UserRound /><span>{text.nextAppointment}</span><strong>{nextAppointment ? `${nextAppointment.date} · ${nextAppointment.time}` : "—"}</strong></div>
    </div>
    <div className="beauty-workspace-subsection"><div className="beauty-workspace-subsection-head"><div><h3>{text.today}</h3><p>{text.todayHint}</p></div><button className="beauty-secondary" type="button" disabled={serverBacked} title={serverBacked ? text.serverBlocksTitle : undefined} onClick={() => setDialog("block")}>{text.blockTime}</button></div>{appointmentList(todayAppointments, text.noTodayAppointments)}{timeBlocks(todayBlocks)}</div>
  </section>;

  const requests = <section className="beauty-workspace-view">
    <div className="beauty-workspace-section-head"><div><span className="beauty-preview-badge">{text.decisionBadge}</span><h2>{text.requests}</h2><p>{text.requestsHint}</p></div><strong className="beauty-workspace-count">{pendingAppointments.length}</strong></div>
    {bookingSyncNotice}
    {appointmentList(pendingAppointments, text.noRequests)}
  </section>;

  const appointments = <section className="beauty-workspace-view">
    <div className="beauty-workspace-section-head"><div><span className="beauty-preview-badge">{text.calendarBadge}</span><h2>{text.appointments}</h2><p>{text.appointmentsHint}</p></div><div className="beauty-workspace-head-actions"><button className="beauty-secondary" type="button" disabled={serverBacked} onClick={() => setDialog("block")}>{text.block}</button><button className="beauty-primary" type="button" disabled={serverBacked} onClick={() => setDialog("appointment")}><Plus size={18} />{text.appointment}</button></div></div>
    {bookingSyncNotice}
    <div className="beauty-workspace-subsection">
      <div className="beauty-workspace-subsection-head"><div><h3>{text.scheduleCalendar}</h3><p>{text.scheduleCalendarHint}</p></div><button className="beauty-secondary" type="button" onClick={onEdit}>{text.configureSchedule}</button></div>
      <div className="service-calendar-toolbar">
        <button type="button" aria-label={text.previousMonth} onClick={() => moveCalendarMonth(-1)} disabled={calendarMonth <= today().slice(0, 7)}><ChevronLeft /></button>
        <strong>{calendarMonthLabel}</strong>
        <button type="button" aria-label={text.nextMonth} onClick={() => moveCalendarMonth(1)}><ChevronRight /></button>
      </div>
      <div className="service-calendar-weekdays">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="service-calendar-grid">{calendarDays.map((date, index) => date ? <button
        className={date === calendarDate ? "is-selected" : ""}
        type="button"
        key={date}
        disabled={date < today() || !isWorkingDate(date)}
        onClick={() => setCalendarDate(date)}
      ><span>{parseDateKey(date).getDate()}</span><small>{allAppointments.filter((item) => item.date === date && ["pending", "confirmed"].includes(item.status)).length || "•"}</small></button> : <span key={`empty-${index}`} />)}</div>
      <div className="service-booking-selected"><CalendarDays /><strong>{calendarDate}</strong><span>{setup.availability.startTime}–{setup.availability.endTime}</span></div>
      <div className="beauty-note"><span>{text.workingDays}: {setup.availability.weekdays.length ? setup.availability.weekdays.map((day) => weekdayLabels[weekdayKeys.indexOf(day)]).join(", ") : text.noneSelected}. {text.scheduleSyncHint}</span></div>
      {appointmentList(calendarAppointments, text.noSelectedDateAppointments)}
    </div>
    <div className="beauty-workspace-subsection"><div className="beauty-workspace-subsection-head"><div><h3>{text.futureConfirmed}</h3></div></div>{appointmentList(upcomingAppointments, text.noConfirmedAppointments)}</div>
    {upcomingBlocks.length > 0 && <div className="beauty-workspace-subsection"><div className="beauty-workspace-subsection-head"><div><h3>{text.blockedTime}</h3><p>{text.blockedTimeHint}</p></div></div><div className="beauty-pilot-list">{timeBlocks(upcomingBlocks)}</div></div>}
  </section>;

  const page = <section className="beauty-workspace-view beauty-workspace-page-view">
    <div className="beauty-workspace-section-head"><div><span className="beauty-preview-badge">{setup.published ? text.publishedBadge : text.draftBadge}</span><h2>{text.professionalPage}</h2><p>{text.professionalPageHint}</p></div><button className="beauty-secondary" type="button" onClick={onEdit}><Scissors size={18} />{text.coreData}</button></div>
    <div className="beauty-workspace-page-card"><div><UserRound /><span><strong>{setup.profile.displayName}</strong><small>{setup.profile.publicLocation}</small></span></div><div><strong>{activeServiceCount}</strong><small>{text.activeServices}</small></div></div>
    <div className="beauty-workspace-page-actions"><button className="beauty-secondary" type="button" onClick={() => window.open(new URL(setup.publicLink, window.location.origin).toString(), "_blank", "noopener,noreferrer")}>{text.openClientPage}</button><button className="beauty-primary" type="button" onClick={onEdit}>{text.profilePriceSchedule}</button></div>
    {pageEditor && <div className="beauty-workspace-page-editor">{pageEditor}</div>}
  </section>;

  const businessCard = <section className="beauty-workspace-view beauty-workspace-business-card-view">
    <div className="beauty-workspace-section-head"><div><span className="beauty-preview-badge">{text.businessCardBadge}</span><h2>{text.businessCard}</h2><p>{text.businessCardHint}</p></div></div>
    {businessCardEditor ? <div className="beauty-workspace-business-card-editor">{businessCardEditor}</div> : <div className="beauty-workspace-empty">{text.businessCardUnavailable}</div>}
  </section>;

  const currentView = view === "overview"
    ? overview
    : view === "requests"
      ? requests
      : view === "appointments"
        ? appointments
        : view === "page"
          ? page
          : businessCard;

  const transitionBusy = Boolean(current && transitioningId === current.id);

  return <div className="beauty-pilot">
    {currentView}
    <nav className="beauty-pilot-nav" aria-label={text.navigationLabel}>
      <NavButton active={view === "overview"} icon={House} label={text.navOverview} onClick={() => setView("overview")} />
      <NavButton active={view === "requests"} icon={BellDot} label={text.navRequests} badge={pendingAppointments.length} onClick={() => setView("requests")} />
      <NavButton active={view === "appointments"} icon={CalendarDays} label={text.navAppointments} onClick={() => setView("appointments")} />
      <NavButton active={view === "page"} icon={UserRound} label={text.navPage} onClick={() => setView("page")} />
      <NavButton active={view === "business-card"} icon={CreditCard} label={text.navBusinessCard} onClick={() => setView("business-card")} />
    </nav>
    {current && <div className="beauty-dialog-backdrop" role="presentation" onPointerDown={() => setSelected("")}><section className="beauty-dialog" role="dialog" aria-modal="true" onPointerDown={(event) => event.stopPropagation()}>
      <button className="beauty-dialog-close" type="button" disabled={transitionBusy} onClick={() => setSelected("")}><X /></button><span className={`beauty-preview-badge status-${current.status}`}>{text.statuses[current.status]}</span>
      <h2>{current.clientName}</h2><p>{current.date} · {current.time}</p><p>{current.serviceName || setup.service.name}</p><p><MessageCircle size={16} /> {current.phone}</p>
      {current.contactBeforeConfirmation && <div className="beauty-note"><strong>{text.contactBeforeConfirmation}</strong></div>}
      {current.requestedTime && <div className="beauty-note"><strong>{text.rescheduleRequested(current.requestedTime)}</strong><button className="beauty-primary" type="button" onClick={approveReschedule}>{text.approveReschedule}</button></div>}
      <div className="beauty-dialog-actions">
        {current.status === "pending" && <><button className="beauty-primary" type="button" disabled={transitionBusy} onClick={() => { void updateStatus("confirmed"); }}><Check size={17} />{text.approve}</button><button className="beauty-secondary" type="button" disabled={transitionBusy} onClick={() => { void updateStatus("declined"); }}>{text.decline}</button></>}
        {current.status === "confirmed" && <><button className="beauty-secondary" type="button" disabled={transitionBusy} onClick={() => { setDialog("reschedule"); setForm({ ...form, time: current.time, date: current.date }); }}>{text.reschedule}</button><button className="beauty-secondary" type="button" disabled={transitionBusy} onClick={() => calendarDownload(current)}>{text.addToCalendar}</button><button className="beauty-primary" type="button" disabled={transitionBusy || !currentLifecycleAvailable} onClick={() => { void updateStatus("completed"); }}>{text.complete}</button><button className="beauty-secondary" type="button" disabled={transitionBusy || !currentLifecycleAvailable} onClick={() => { void updateStatus("no_show"); }}>{text.noShow}</button><button className="beauty-danger" type="button" disabled={transitionBusy} onClick={() => { void updateStatus("cancelled"); }}>{text.cancel}</button></>}
      </div>
      {current.status === "confirmed" && !currentLifecycleAvailable && <div className="beauty-note"><span>{text.lifecycleLocked}</span></div>}
    </section></div>}
    {dialog && <div className="beauty-dialog-backdrop" onPointerDown={() => setDialog(null)}><section className="beauty-dialog" role="dialog" aria-modal="true" onPointerDown={(event) => event.stopPropagation()}>
      <button className="beauty-dialog-close" type="button" onClick={() => setDialog(null)}><X /></button><h2>{dialog === "booking" ? text.bookingRequestDialog : dialog === "appointment" ? text.manualAppointmentDialog : dialog === "block" ? text.timeBlockDialog : text.rescheduleDialog}</h2>
      {dialog !== "reschedule" && dialog !== "block" && <><label>{text.name}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>{text.phone}<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label></>}
      {dialog === "block" && <label>{text.blockReason}<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>}
      {dialog !== "block" && <label>{text.date}<input type="date" min={today()} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>}
      <div className="beauty-slots">{slots.map((slot) => <button type="button" disabled={occupied.has(`${form.date}:${slot}`) && !(dialog === "reschedule" && form.date === current?.date && slot === current?.time)} className={form.time === slot ? "is-selected" : ""} key={slot} onClick={() => setForm({ ...form, time: slot })}>{slot}</button>)}</div>
      {occupied.has(`${form.date}:${form.time}`) && dialog !== "reschedule" && <div className="beauty-errors">{text.occupiedSlot}</div>}
      <div className="beauty-note"><span>{dialog === "booking" ? text.bookingPendingNotice : dialog === "reschedule" && current?.bookingId ? text.serverRescheduleNotice : text.localChangesNotice}</span></div>
      <button className="beauty-primary" type="button" disabled={dialog === "reschedule" && transitionBusy} onClick={dialog === "reschedule" ? () => { void requestReschedule(); } : submit}>{dialog === "booking" ? text.sendRequest : text.save}</button>
    </section></div>}
  </div>;
}
