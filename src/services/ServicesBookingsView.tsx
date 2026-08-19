import { useCallback, useEffect, useState } from "react";
import { BellRing, CalendarDays, ChevronDown, Clock3, MapPin, RefreshCw, Ticket, XCircle } from "lucide-react";
import type { Language } from "../types";
import {
  cancelClientServiceBooking,
  loadClientServiceBookings,
  type ClientServiceBooking,
  type ClientServiceBookingSnapshot,
  type ClientServiceBookingStatus,
} from "./servicesBookingClientRepository";
import {
  cancelServiceWaitlist,
  loadMyServiceWaitlist,
  type ServiceWaitlistEntry,
  type ServiceWaitlistSnapshot,
} from "./servicesBookingWaitlistRepository";
import { subscribeServiceBookings } from "./servicesBookingRepository";
import "./services-bookings.css";

const copy = {
  ru: {
    title: "Мои записи",
    hint: "Запросы и подтверждённые записи к мастерам",
    loading: "Загружаем записи…",
    error: "Не удалось загрузить записи",
    retry: "Повторить",
    empty: "У вас пока нет записей",
    upcomingEmpty: "Нет предстоящих записей",
    history: "История",
    fallback: "Сервер записей ещё не подключён. Показаны записи с этого устройства.",
    address: "Место",
    duration: "Длительность",
    cancel: "Отменить запись",
    cancelling: "Отменяем…",
    cancelConfirm: "Отменить эту запись?",
    cancelLocked: "Отмена доступна не позднее чем за 24 часа до начала.",
    cancelFailed: "Не удалось отменить запись",
  },
  uk: {
    title: "Мої записи",
    hint: "Запити та підтверджені записи до майстрів",
    loading: "Завантажуємо записи…",
    error: "Не вдалося завантажити записи",
    retry: "Повторити",
    empty: "У вас поки немає записів",
    upcomingEmpty: "Немає майбутніх записів",
    history: "Історія",
    fallback: "Сервер записів ще не підключений. Показано записи з цього пристрою.",
    address: "Місце",
    duration: "Тривалість",
    cancel: "Скасувати запис",
    cancelling: "Скасовуємо…",
    cancelConfirm: "Скасувати цей запис?",
    cancelLocked: "Скасування доступне не пізніше ніж за 24 години до початку.",
    cancelFailed: "Не вдалося скасувати запис",
  },
  cs: {
    title: "Moje rezervace",
    hint: "Žádosti a potvrzené rezervace u profesionálů",
    loading: "Načítáme rezervace…",
    error: "Rezervace se nepodařilo načíst",
    retry: "Opakovat",
    empty: "Zatím nemáte žádné rezervace",
    upcomingEmpty: "Nemáte žádné nadcházející rezervace",
    history: "Historie",
    fallback: "Server rezervací ještě není připojen. Zobrazují se záznamy z tohoto zařízení.",
    address: "Místo",
    duration: "Délka",
    cancel: "Zrušit rezervaci",
    cancelling: "Rušíme…",
    cancelConfirm: "Zrušit tuto rezervaci?",
    cancelLocked: "Rezervaci lze zrušit nejpozději 24 hodin před začátkem.",
    cancelFailed: "Rezervaci se nepodařilo zrušit",
  },
  en: {
    title: "My bookings",
    hint: "Requests and confirmed professional appointments",
    loading: "Loading bookings…",
    error: "Bookings could not be loaded",
    retry: "Retry",
    empty: "You have no bookings yet",
    upcomingEmpty: "You have no upcoming bookings",
    history: "History",
    fallback: "The booking server is not connected yet. Showing records from this device.",
    address: "Location",
    duration: "Duration",
    cancel: "Cancel booking",
    cancelling: "Cancelling…",
    cancelConfirm: "Cancel this booking?",
    cancelLocked: "Cancellation is available until 24 hours before the appointment.",
    cancelFailed: "Could not cancel the booking",
  },
} satisfies Record<Language, Record<string, string>>;

const waitlistCopy = {
  ru: { title: "Список ожидания", status: "Ожидает слот", notReserved: "Место не резервируется", cancel: "Убрать из списка", cancelling: "Убираем…", cancelConfirm: "Убрать этот слот из списка ожидания?", error: "Не удалось обновить список ожидания" },
  uk: { title: "Список очікування", status: "Очікує слот", notReserved: "Місце не резервується", cancel: "Прибрати зі списку", cancelling: "Прибираємо…", cancelConfirm: "Прибрати цей слот зі списку очікування?", error: "Не вдалося оновити список очікування" },
  cs: { title: "Čekací listina", status: "Čeká na termín", notReserved: "Termín není rezervovaný", cancel: "Odebrat z listiny", cancelling: "Odebíráme…", cancelConfirm: "Odebrat tento termín z čekací listiny?", error: "Čekací listinu se nepodařilo aktualizovat" },
  en: { title: "Waitlist", status: "Waiting for slot", notReserved: "The slot is not reserved", cancel: "Leave waitlist", cancelling: "Removing…", cancelConfirm: "Remove this slot from your waitlist?", error: "Could not update the waitlist" },
} satisfies Record<Language, Record<string, string>>;

const statusCopy: Record<Language, Record<ClientServiceBookingStatus, string>> = {
  ru: {
    pending: "Ожидает подтверждения",
    confirmed: "Подтверждена",
    declined: "Отклонена",
    cancelled: "Отменена",
    completed: "Завершена",
    no_show: "Неявка",
    expired: "Истекла",
  },
  uk: {
    pending: "Очікує підтвердження",
    confirmed: "Підтверджено",
    declined: "Відхилено",
    cancelled: "Скасовано",
    completed: "Завершено",
    no_show: "Неявка",
    expired: "Термін минув",
  },
  cs: {
    pending: "Čeká na potvrzení",
    confirmed: "Potvrzeno",
    declined: "Odmítnuto",
    cancelled: "Zrušeno",
    completed: "Dokončeno",
    no_show: "Nedostavil se",
    expired: "Vypršelo",
  },
  en: {
    pending: "Awaiting confirmation",
    confirmed: "Confirmed",
    declined: "Declined",
    cancelled: "Cancelled",
    completed: "Completed",
    no_show: "No-show",
    expired: "Expired",
  },
};

const locale: Record<Language, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  cs: "cs-CZ",
  en: "en-GB",
};

const emptySnapshot: ClientServiceBookingSnapshot = { bookings: [], source: "browser-local" };
const emptyWaitlistSnapshot: ServiceWaitlistSnapshot = { entries: [], source: "unavailable" };
const cancellationLeadMs = 24 * 60 * 60 * 1000;
const historyStatuses = new Set<ClientServiceBookingStatus>(["declined", "cancelled", "completed", "no_show", "expired"]);

const formatDate = (booking: ClientServiceBooking, language: Language) => {
  const date = new Date(`${booking.date}T12:00:00`);
  if (Number.isNaN(date.getTime())) return booking.date;
  return new Intl.DateTimeFormat(locale[language], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

const formatWaitlistDate = (entry: ServiceWaitlistEntry, language: Language) => {
  const date = new Date(`${entry.date}T12:00:00`);
  if (Number.isNaN(date.getTime())) return entry.date;
  return new Intl.DateTimeFormat(locale[language], { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .format(date);
};

const isHistoryBooking = (booking: ClientServiceBooking, now: number) => {
  if (historyStatuses.has(booking.status)) return true;
  const startsAt = new Date(booking.startsAt).getTime();
  return Number.isFinite(startsAt) && startsAt < now;
};

function BookingCard({
  booking,
  language,
  cancelling,
  onCancel,
}: {
  booking: ClientServiceBooking;
  language: Language;
  cancelling: boolean;
  onCancel: (booking: ClientServiceBooking) => void;
}) {
  const text = copy[language];
  const location = booking.exactAddress || booking.publicLocation;
  const cancellationStatus = booking.status === "pending" || booking.status === "confirmed";
  const startsAt = new Date(booking.startsAt).getTime();
  const cancellationAllowed = cancellationStatus
    && Number.isFinite(startsAt)
    && startsAt - Date.now() >= cancellationLeadMs;
  return (
    <article className={`services-booking-card status-${booking.status}`}>
      <header>
        <span><strong>{booking.professionalName}</strong><small>{booking.serviceName}</small></span>
        <b>{statusCopy[language][booking.status]}</b>
      </header>
      <div className="services-booking-meta">
        <div><CalendarDays /><span><small>{formatDate(booking, language)}</small><strong>{booking.time}</strong></span></div>
        <div><Clock3 /><span><small>{text.duration}</small><strong>{booking.durationMinutes} min</strong></span></div>
        <div><Ticket /><span><small>{booking.priceCzk} {booking.currency}</small><strong>{booking.serviceName}</strong></span></div>
        <div><MapPin /><span><small>{text.address}</small><strong>{location}</strong></span></div>
      </div>
      {cancellationStatus && <div className="services-booking-cancel">
        {cancellationAllowed
          ? <button type="button" onClick={() => onCancel(booking)} disabled={cancelling}><XCircle />{cancelling ? text.cancelling : text.cancel}</button>
          : <small>{text.cancelLocked}</small>}
      </div>}
    </article>
  );
}

function ServiceWaitlistSection({ language }: { language: Language }) {
  const text = waitlistCopy[language];
  const [snapshot, setSnapshot] = useState<ServiceWaitlistSnapshot>(emptyWaitlistSnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await loadMyServiceWaitlist(language));
      setError("");
    } catch {
      setSnapshot(emptyWaitlistSnapshot);
      setError(text.error);
    } finally {
      setLoading(false);
    }
  }, [language, text.error]);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const cancelWaitlist = useCallback(async (entry: ServiceWaitlistEntry) => {
    if (!window.confirm(text.cancelConfirm)) return;
    setCancellingId(entry.id);
    setError("");
    try {
      const result = await cancelServiceWaitlist(entry);
      if (result === "unavailable") setError(text.error);
      await refresh();
    } catch {
      setError(text.error);
    } finally {
      setCancellingId("");
    }
  }, [refresh, text.cancelConfirm, text.error]);

  const activeEntries = snapshot.entries.filter((entry) => entry.status === "active" && new Date(entry.slotStart).getTime() > Date.now());
  if (!loading && !error && (snapshot.source !== "server" || activeEntries.length === 0)) return null;

  return <section className="services-bookings-history" aria-busy={loading}>
    <div className="services-bookings-history-toggle"><span>{text.title}</span><b>{activeEntries.length}</b><BellRing aria-hidden="true" /></div>
    {error && <div className="services-bookings-state is-error">{error}</div>}
    {loading && <div className="services-bookings-state">{text.title}…</div>}
    {!loading && activeEntries.length > 0 && <div className="services-bookings-list">
      {activeEntries.map((entry) => <article className="services-booking-card status-pending" key={entry.id}>
        <header><span><strong>{entry.serviceName}</strong><small>{text.notReserved}</small></span><b>{text.status}</b></header>
        <div className="services-booking-meta">
          <div><CalendarDays /><span><small>{formatWaitlistDate(entry, language)}</small><strong>{entry.time}</strong></span></div>
          <div><Clock3 /><span><small>{entry.durationMinutes} min</small><strong>{entry.serviceName}</strong></span></div>
          <div><MapPin /><span><small>{entry.publicLocation}</small><strong>{text.notReserved}</strong></span></div>
        </div>
        <div className="services-booking-cancel"><button type="button" onClick={() => void cancelWaitlist(entry)} disabled={cancellingId === entry.id}><XCircle />{cancellingId === entry.id ? text.cancelling : text.cancel}</button></div>
      </article>)}
    </div>}
  </section>;
}

export function ServicesBookingsView({ language }: { language: Language }) {
  const text = copy[language];
  const [snapshot, setSnapshot] = useState<ClientServiceBookingSnapshot>(emptySnapshot);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [cancellingId, setCancellingId] = useState("");
  const [actionError, setActionError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const refresh = useCallback(async () => {
    setState((current) => current === "ready" ? "ready" : "loading");
    try {
      const next = await loadClientServiceBookings(language);
      setSnapshot(next);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [language]);

  const cancelBooking = useCallback(async (booking: ClientServiceBooking) => {
    if (!window.confirm(text.cancelConfirm)) return;
    setCancellingId(booking.id);
    setActionError("");
    try {
      const result = await cancelClientServiceBooking(booking);
      if (result !== "cancelled" && result !== "local_cancelled") {
        setActionError(result === "policy_required" ? text.cancelLocked : text.cancelFailed);
      }
      await refresh();
    } catch {
      setActionError(text.cancelFailed);
    } finally {
      setCancellingId("");
    }
  }, [refresh, text]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const next = await loadClientServiceBookings(language);
        if (!active) return;
        setSnapshot(next);
        setState("ready");
      } catch {
        if (active) setState("error");
      }
    };
    void run();
    const unsubscribe = subscribeServiceBookings(() => { void run(); });
    const onFocus = () => { void run(); };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [language]);

  const now = Date.now();
  const activeBookings = snapshot.bookings.filter((booking) => !isHistoryBooking(booking, now));
  const historyBookings = snapshot.bookings.filter((booking) => isHistoryBooking(booking, now));

  return (
    <section className="page-section services-client-view services-bookings-view">
      <div className="page-title"><CalendarDays /><div><h1>{text.title}</h1><p>{text.hint}</p></div></div>
      <ServiceWaitlistSection language={language} />
      {snapshot.source === "local-fallback" && <div className="services-bookings-fallback">{text.fallback}</div>}
      {actionError && <div className="services-bookings-state is-error">{actionError}</div>}
      {state === "loading" && <div className="services-bookings-state">{text.loading}</div>}
      {state === "error" && <div className="services-bookings-state is-error"><span>{text.error}</span><button type="button" onClick={() => void refresh()}><RefreshCw />{text.retry}</button></div>}
      {state === "ready" && (snapshot.bookings.length
        ? <>
            {activeBookings.length
              ? <div className="services-bookings-list">{activeBookings.map((booking) => <BookingCard key={booking.id} booking={booking} language={language} cancelling={cancellingId === booking.id} onCancel={(item) => void cancelBooking(item)} />)}</div>
              : <div className="services-bookings-state">{text.upcomingEmpty}</div>}
            {historyBookings.length > 0 && <div className="services-bookings-history">
              <button
                type="button"
                className="services-bookings-history-toggle"
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((open) => !open)}
              >
                <span>{text.history}</span>
                <b>{historyBookings.length}</b>
                <ChevronDown aria-hidden="true" />
              </button>
              {historyOpen && <div className="services-bookings-list services-bookings-history-list">
                {historyBookings.map((booking) => <BookingCard key={booking.id} booking={booking} language={language} cancelling={false} onCancel={() => undefined} />)}
              </div>}
            </div>}
          </>
        : <div className="services-bookings-state">{text.empty}</div>)}
    </section>
  );
}
