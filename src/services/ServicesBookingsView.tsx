import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Clock3, MapPin, RefreshCw, Ticket, XCircle } from "lucide-react";
import type { Language } from "../types";
import {
  cancelClientServiceBooking,
  loadClientServiceBookings,
  type ClientServiceBooking,
  type ClientServiceBookingSnapshot,
  type ClientServiceBookingStatus,
} from "./servicesBookingClientRepository";
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
