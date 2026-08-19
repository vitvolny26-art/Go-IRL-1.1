import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellRing, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock3, MapPin, Scissors, Ticket, UserRound, UsersRound, X } from "lucide-react";
import type { Language } from "../types";
import { getCity } from "../config/cities";
import { CardShareAction } from "../components/CardShareAction";
import type { ServicesProfessional } from "./servicesProfessionalDirectory";
import { getServiceArtwork } from "./serviceArtwork";
import {
  createServiceBookingIdempotencyKey,
  loadServiceAvailability,
  submitServiceBooking,
  type ServiceAvailabilitySnapshot,
  type SubmitServiceBookingResultCode,
} from "./servicesBookingMutationRepository";
import {
  createServiceWaitlistIdempotencyKey,
  joinServiceWaitlist,
  loadServiceWaitlistableSlots,
  type JoinServiceWaitlistResultCode,
  type ServiceWaitlistableSnapshot,
} from "./servicesBookingWaitlistRepository";
import { listServiceBookings } from "./servicesBookingRepository";
import "./service-activity-card.css";
import "./service-activity-card-overrides.css";

type PilotAppointment = { id: string; date: string; time: string; status: string };
type PilotBlock = { id: string; date: string; time: string };
type PilotData = { appointments?: PilotAppointment[]; blocks?: PilotBlock[] };
type Reminder = { profileId: string; serviceName?: string; leadMinutes: number; channel: string; date: string; time: string };
type WorkspaceSnapshot = { availability?: { weekdays?: string[] } };

const pilotKey = "go-irl-beauty-pilot-v1";
const remindersKey = "go-irl-services-reminders-v2";
const workspaceRecoveryKey = "go-irl-beauty-workspace-v2";
const defaultSlots = ["09:00", "10:30", "12:00", "14:30", "16:00"];
const locale: Record<Language, string> = { ru: "ru-RU", uk: "uk-UA", cs: "cs-CZ", en: "en-GB" };
const weekdayNumber: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const text = {
  ru: { services: "Услуги", selectService: "Выберите услугу", book: "Записаться", duration: "Длительность", price: "Цена", address: "Адрес", date: "Дата", master: "Мастер", close: "Закрыть", booking: "Запись к мастеру", chooseDate: "Выберите дату", chooseTime: "Выберите время", send: "Отправить запрос", sending: "Отправляем…", sent: "Запрос отправлен", reminder: "Напомнить", reminderTitle: "Напоминание о записи", save: "Сохранить напоминание", slots: "Свободные окна", noSlots: "Нет свободного времени", loadingSlots: "Загружаем свободное время…", availabilityError: "Не удалось загрузить свободное время", retry: "Повторить", bookingFailed: "Не удалось отправить запрос. Повторите.", slotTaken: "Это время уже занято. Выберите другое.", slotBlocked: "Это время недоступно у мастера.", slotUnavailable: "Выбранное время больше недоступно.", serviceUnavailable: "Эта услуга сейчас недоступна.", localMode: "Временный режим: запись сохранится только на этом устройстве.", previousMonth: "Предыдущий месяц", nextMonth: "Следующий месяц", name: "Имя", contact: "Контакт", required: "Обязательное поле", contactBeforeConfirmation: "Перед подтверждением записи свяжитесь со мной" },
  uk: { services: "Послуги", selectService: "Оберіть послугу", book: "Записатися", duration: "Тривалість", price: "Ціна", address: "Адреса", date: "Дата", master: "Майстер", close: "Закрити", booking: "Запис до майстра", chooseDate: "Оберіть дату", chooseTime: "Оберіть час", send: "Надіслати запит", sending: "Надсилаємо…", sent: "Запит надіслано", reminder: "Нагадати", reminderTitle: "Нагадування про запис", save: "Зберегти нагадування", slots: "Вільні вікна", noSlots: "Немає вільного часу", loadingSlots: "Завантажуємо вільний час…", availabilityError: "Не вдалося завантажити вільний час", retry: "Повторити", bookingFailed: "Не вдалося надіслати запит. Повторіть.", slotTaken: "Цей час уже зайнятий. Оберіть інший.", slotBlocked: "Цей час недоступний у майстра.", slotUnavailable: "Обраний час більше недоступний.", serviceUnavailable: "Ця послуга зараз недоступна.", localMode: "Тимчасовий режим: запис збережеться лише на цьому пристрої.", previousMonth: "Попередній місяць", nextMonth: "Наступний місяць", name: "Ім’я", contact: "Контакт", required: "Обов’язкове поле", contactBeforeConfirmation: "Перед підтвердженням запису зв’яжіться зі мною" },
  cs: { services: "Služby", selectService: "Vyberte službu", book: "Rezervovat", duration: "Délka", price: "Cena", address: "Adresa", date: "Datum", master: "Profesionál", close: "Zavřít", booking: "Rezervace", chooseDate: "Vyberte datum", chooseTime: "Vyberte čas", send: "Odeslat žádost", sending: "Odesíláme…", sent: "Žádost odeslána", reminder: "Připomenout", reminderTitle: "Připomínka rezervace", save: "Uložit připomínku", slots: "Volné termíny", noSlots: "Žádný volný termín", loadingSlots: "Načítáme volné termíny…", availabilityError: "Volné termíny se nepodařilo načíst", retry: "Opakovat", bookingFailed: "Žádost se nepodařilo odeslat. Opakujte.", slotTaken: "Tento termín už je obsazený. Vyberte jiný.", slotBlocked: "Tento termín není u profesionála dostupný.", slotUnavailable: "Vybraný termín už není dostupný.", serviceUnavailable: "Tato služba nyní není dostupná.", localMode: "Dočasný režim: rezervace se uloží pouze na tomto zařízení.", previousMonth: "Předchozí měsíc", nextMonth: "Další měsíc", name: "Jméno", contact: "Kontakt", required: "Povinné pole", contactBeforeConfirmation: "Před potvrzením rezervace mě kontaktujte" },
  en: { services: "Services", selectService: "Choose a service", book: "Book", duration: "Duration", price: "Price", address: "Address", date: "Date", master: "Professional", close: "Close", booking: "Book a professional", chooseDate: "Choose a date", chooseTime: "Choose a time", send: "Send request", sending: "Sending…", sent: "Request sent", reminder: "Remind me", reminderTitle: "Booking reminder", save: "Save reminder", slots: "Available slots", noSlots: "No available time", loadingSlots: "Loading available times…", availabilityError: "Could not load available times", retry: "Retry", bookingFailed: "Could not send the request. Try again.", slotTaken: "That time was just taken. Choose another.", slotBlocked: "That time is unavailable for the professional.", slotUnavailable: "The selected time is no longer available.", serviceUnavailable: "This service is currently unavailable.", localMode: "Temporary mode: this booking will be stored only on this device.", previousMonth: "Previous month", nextMonth: "Next month", name: "Name", contact: "Contact", required: "Required field", contactBeforeConfirmation: "Contact me before confirming the booking" },
} satisfies Record<Language, Record<string, string>>;

const waitlistText = {
  ru: { label: "Список ожидания", hint: "Занятые слоты — можно подписаться на освобождение.", join: "Сообщить, если освободится", joining: "Добавляем…", joined: "Вы в списке ожидания.", notReserved: "Место не резервируется.", unavailable: "Список ожидания временно недоступен.", slotAvailable: "Слот уже свободен. Запишитесь прямо сейчас.", alreadyBooked: "У вас уже есть запись, пересекающая этот слот.", slotUnavailable: "Этот слот больше нельзя добавить в список ожидания.", loading: "Проверяем занятые слоты…" },
  uk: { label: "Список очікування", hint: "Зайняті слоти — можна підписатися на звільнення.", join: "Повідомити, якщо звільниться", joining: "Додаємо…", joined: "Ви у списку очікування.", notReserved: "Місце не резервується.", unavailable: "Список очікування тимчасово недоступний.", slotAvailable: "Слот уже вільний. Запишіться зараз.", alreadyBooked: "У вас уже є запис, що перетинається з цим слотом.", slotUnavailable: "Цей слот більше не можна додати до списку очікування.", loading: "Перевіряємо зайняті слоти…" },
  cs: { label: "Čekací listina", hint: "U obsazených termínů můžete zapnout upozornění na uvolnění.", join: "Upozornit při uvolnění", joining: "Přidáváme…", joined: "Jste na čekací listině.", notReserved: "Termín není rezervovaný.", unavailable: "Čekací listina je dočasně nedostupná.", slotAvailable: "Termín je už volný. Rezervujte ho přímo.", alreadyBooked: "Už máte rezervaci, která se s tímto termínem překrývá.", slotUnavailable: "Tento termín už nelze přidat na čekací listinu.", loading: "Kontrolujeme obsazené termíny…" },
  en: { label: "Waitlist", hint: "For occupied times, you can subscribe to slot-release alerts.", join: "Notify me if it opens", joining: "Adding…", joined: "You are on the waitlist.", notReserved: "The slot is not reserved.", unavailable: "The waitlist is temporarily unavailable.", slotAvailable: "The slot is already available. Book it now.", alreadyBooked: "You already have a booking that overlaps this slot.", slotUnavailable: "This slot can no longer be added to the waitlist.", loading: "Checking occupied times…" },
} satisfies Record<Language, Record<string, string>>;

const localDateKey = (value = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};

const monthKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
const serviceKey = (professional: ServicesProfessional) => `${professional.profileId}:${professional.serviceName}:${professional.durationMinutes}:${professional.priceCzk}`;

const readJson = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || "null") as T || fallback; }
  catch { return fallback; }
};

const workingWeekdays = () => {
  const snapshot = readJson<WorkspaceSnapshot>(workspaceRecoveryKey, {});
  const configured = snapshot.availability?.weekdays?.map((item) => weekdayNumber[item]).filter((item): item is number => typeof item === "number");
  return new Set(configured?.length ? configured : [1, 2, 3, 4, 5]);
};

const freeSlotsFor = (date: string, profileId: string, serviceName: string) => {
  const pilot = readJson<PilotData>(pilotKey, {});
  const bookings = listServiceBookings();
  const occupied = new Set([
    ...(pilot.appointments || []).filter((item) => item.date === date && ["pending", "confirmed"].includes(item.status)).map((item) => item.time),
    ...(pilot.blocks || []).filter((item) => item.date === date).map((item) => item.time),
    ...bookings.filter((item) => item.profileId === profileId && item.serviceName === serviceName && item.date === date && ["pending", "confirmed"].includes(item.status)).map((item) => item.time),
  ]);
  return defaultSlots.filter((slot) => !occupied.has(slot));
};

const formatCompactDate = (date: string, language: Language) => new Intl.DateTimeFormat(locale[language], {
  day: "2-digit",
  month: "short",
}).format(parseDateKey(date)).replace(/\.$/, "");

const useTodayKey = () => {
  const [value, setValue] = useState(localDateKey);
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      setValue(localDateKey());
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = window.setTimeout(schedule, Math.max(1000, next.getTime() - now.getTime()));
    };
    const onVisibility = () => { if (!document.hidden) setValue(localDateKey()); };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return value;
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

const availabilityRange = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const finalDay = new Date(year, monthNumber, 0, 12).getDate();
  return {
    fromDate: `${month}-01`,
    toDate: `${month}-${String(finalDay).padStart(2, "0")}`,
  };
};

function ServiceReminderAction({ professional, date, time, language }: { professional: ServicesProfessional; date: string; time: string; language: Language }) {
  const labels = text[language];
  const existing = readJson<Reminder[]>(remindersKey, []).find((item) => item.profileId === professional.profileId && (!item.serviceName || item.serviceName === professional.serviceName));
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(Boolean(existing));
  const [leadMinutes, setLeadMinutes] = useState(existing?.leadMinutes || 60);
  const [channel, setChannel] = useState(existing?.channel || "telegram");

  useEffect(() => {
    const current = readJson<Reminder[]>(remindersKey, []).find((item) => item.profileId === professional.profileId && (!item.serviceName || item.serviceName === professional.serviceName));
    setSaved(Boolean(current));
    setLeadMinutes(current?.leadMinutes || 60);
    setChannel(current?.channel || "telegram");
    setOpen(false);
  }, [professional.profileId, professional.serviceName]);

  const save = () => {
    const current = readJson<Reminder[]>(remindersKey, []).filter((item) => !(item.profileId === professional.profileId && (!item.serviceName || item.serviceName === professional.serviceName)));
    localStorage.setItem(remindersKey, JSON.stringify([...current, { profileId: professional.profileId, serviceName: professional.serviceName, leadMinutes, channel, date, time }]));
    setSaved(true);
    setOpen(false);
  };

  const popup = open ? createPortal(<div className="service-popup-backdrop" onPointerDown={() => setOpen(false)}>
    <section className="service-popup-panel service-reminder-popover" role="dialog" aria-modal="true" aria-label={labels.reminderTitle} onPointerDown={(event) => event.stopPropagation()}>
      <button className="service-popup-close" type="button" aria-label={labels.close} onClick={() => setOpen(false)}><X /></button>
      <strong>{labels.reminderTitle}</strong>
      <small>{professional.serviceName} · {formatCompactDate(date, language)} · {time}</small>
      <div className="service-reminder-choice-grid">{[15, 60, 180, 1440].map((value) => <button className={leadMinutes === value ? "is-selected" : ""} type="button" key={value} onClick={() => setLeadMinutes(value)}>{value === 1440 ? "1 day" : `${value} min`}{leadMinutes === value && <Check />}</button>)}</div>
      <div className="service-reminder-channel-grid">{["telegram", "whatsapp", "instagram", "messenger"].map((value) => <button className={channel === value ? "is-selected" : ""} type="button" key={value} onClick={() => setChannel(value)}>{value}</button>)}</div>
      <button className="service-reminder-save" type="button" onClick={save}>{labels.save}</button>
    </section>
  </div>, document.body) : null;

  return <span className="service-reminder-action">
    <button className={saved ? "sport-card-icon-action is-reminder-active" : "sport-card-icon-action"} type="button" aria-label={labels.reminder} aria-expanded={open} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value); }}>{saved ? <BellRing /> : <Bell />}</button>
    {popup}
  </span>;
}

type ServiceActivityCardProps = {
  professional: ServicesProfessional;
  serviceOptions?: ServicesProfessional[];
  language: Language;
  artworkVariant?: "share" | "card" | "sheet";
};

export function ServiceActivityCard({ professional: initialProfessional, serviceOptions = [], language, artworkVariant = "share" }: ServiceActivityCardProps) {
  const labels = text[language];
  const waitlistLabels = waitlistText[language];
  const options = useMemo(() => Array.from(new Map([initialProfessional, ...serviceOptions].map((item) => [serviceKey(item), item])).values()), [initialProfessional, serviceOptions]);
  const [selectedServiceKey, setSelectedServiceKey] = useState(() => serviceKey(initialProfessional));
  const professional = options.find((item) => serviceKey(item) === selectedServiceKey) || options[0] || initialProfessional;
  const todayDate = useTodayKey();
  const [cardDate, setCardDate] = useState(todayDate);
  const [compactCalendarOpen, setCompactCalendarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSent, setBookingSent] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [bookingDate, setBookingDate] = useState(cardDate);
  const [calendarMonth, setCalendarMonth] = useState(() => cardDate.slice(0, 7));
  const [bookingName, setBookingName] = useState("");
  const [bookingContact, setBookingContact] = useState("");
  const [contactBeforeConfirmation, setContactBeforeConfirmation] = useState(false);
  const [time, setTime] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(createServiceBookingIdempotencyKey);
  const [availability, setAvailability] = useState<ServiceAvailabilitySnapshot | null>(null);
  const [availabilityMonth, setAvailabilityMonth] = useState(() => cardDate.slice(0, 7));
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const [waitlistable, setWaitlistable] = useState<ServiceWaitlistableSnapshot | null>(null);
  const [waitlistLoading, setWaitlistLoading] = useState(true);
  const [waitlistLoadError, setWaitlistLoadError] = useState(false);
  const [waitlistTime, setWaitlistTime] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistSent, setWaitlistSent] = useState(false);
  const [waitlistActionError, setWaitlistActionError] = useState("");
  const [waitlistIdempotencyKey, setWaitlistIdempotencyKey] = useState(createServiceWaitlistIdempotencyKey);
  const artwork = getServiceArtwork(professional.serviceName);
  const cardArtwork = artwork ? (artworkVariant === "sheet" ? artwork.sheet : artworkVariant === "card" ? artwork.card : artwork.share) : null;
  const localizedCity = getCity(professional.cityId || "olomouc").name[language];
  const localizedLocation = professional.publicLocation.replace(/Olomouc|Оломоуц/giu, localizedCity);
  const locationDetail = localizedLocation
    .replace(new RegExp(`(^|,\\s*)${localizedCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(,|$)`, "iu"), "$1")
    .replace(/^[\s,·–—-]+|[\s,·–—-]+$/g, "")
    .trim() || localizedLocation;
  const url = new URL(professional.publicLink, window.location.origin).toString();
  const avatar = professional.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const allowedWeekdays = useMemo(workingWeekdays, [bookingOpen]);
  const days = useMemo(() => calendarCells(calendarMonth), [calendarMonth]);
  const weekdayLabels = useMemo(() => {
    const monday = new Date(2026, 7, 3, 12);
    return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale[language], { weekday: "short" }).format(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index, 12)).slice(0, 2));
  }, [language]);

  useEffect(() => {
    if (!options.some((item) => serviceKey(item) === selectedServiceKey)) setSelectedServiceKey(serviceKey(options[0] || initialProfessional));
  }, [initialProfessional, options, selectedServiceKey]);

  useEffect(() => {
    if (cardDate < todayDate) setCardDate(todayDate);
  }, [cardDate, todayDate]);

  useEffect(() => {
    let active = true;
    const { fromDate, toDate } = availabilityRange(calendarMonth);
    setAvailabilityMonth(calendarMonth);
    setAvailabilityLoading(true);
    setAvailabilityError(false);
    void loadServiceAvailability(professional.profileId, professional.serviceId, fromDate, toDate)
      .then((snapshot) => {
        if (!active) return;
        setAvailability(snapshot);
        setAvailabilityLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setAvailability(null);
        setAvailabilityError(true);
        setAvailabilityLoading(false);
      });
    return () => { active = false; };
  }, [availabilityRevision, calendarMonth, professional.profileId, professional.serviceId]);

  useEffect(() => {
    let active = true;
    const { fromDate, toDate } = availabilityRange(calendarMonth);
    setWaitlistLoading(true);
    setWaitlistLoadError(false);
    void loadServiceWaitlistableSlots(professional.profileId, professional.serviceId, fromDate, toDate)
      .then((snapshot) => {
        if (!active) return;
        setWaitlistable(snapshot);
        setWaitlistLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setWaitlistable(null);
        setWaitlistLoadError(true);
        setWaitlistLoading(false);
      });
    return () => { active = false; };
  }, [availabilityRevision, calendarMonth, professional.profileId, professional.serviceId]);

  const slotsForDate = useCallback((date: string, item: ServicesProfessional = professional) => {
    const localSlots = freeSlotsFor(date, item.profileId, item.serviceName);
    const currentService = item.profileId === professional.profileId && item.serviceId === professional.serviceId;
    if (!currentService || date.slice(0, 7) !== availabilityMonth) return localSlots;
    if (availabilityLoading || availabilityError) return [];
    if (availability?.source === "server") return availability.slotsByDate[date] || [];
    return localSlots;
  }, [availability, availabilityError, availabilityLoading, availabilityMonth, bookingSent, professional]);

  const waitlistSlotsForDate = useCallback((date: string) => {
    if (date.slice(0, 7) !== availabilityMonth || waitlistLoading || waitlistLoadError) return [];
    if (waitlistable?.source === "server") return waitlistable.slotsByDate[date] || [];
    return [];
  }, [availabilityMonth, waitlistLoadError, waitlistLoading, waitlistable]);

  const cardSlots = useMemo(() => slotsForDate(cardDate), [cardDate, slotsForDate]);
  const bookingSlots = useMemo(() => slotsForDate(bookingDate), [bookingDate, slotsForDate]);
  const bookingWaitlistSlots = useMemo(() => waitlistSlotsForDate(bookingDate), [bookingDate, waitlistSlotsForDate]);
  const nextSlot = cardSlots[0] || "—";
  const occupiedCount = Math.max(0, defaultSlots.length - cardSlots.length);
  const slotSummary = availability?.source === "server" && availabilityMonth === cardDate.slice(0, 7)
    ? String(cardSlots.length)
    : `${occupiedCount}/${defaultSlots.length}`;
  const bookingFormValid = Boolean(time && bookingName.trim() && bookingContact.trim() && !bookingSubmitting);

  useEffect(() => {
    setBookingDate(cardDate);
    setCalendarMonth(cardDate.slice(0, 7));
    setBookingSent(false);
    setBookingError("");
    setSlotsOpen(false);
    setCompactCalendarOpen(false);
    setIdempotencyKey(createServiceBookingIdempotencyKey());
    setWaitlistTime("");
    setWaitlistSent(false);
    setWaitlistActionError("");
    setWaitlistIdempotencyKey(createServiceWaitlistIdempotencyKey());
  }, [cardDate, professional.profileId, professional.serviceId]);

  useEffect(() => {
    if (!bookingSubmitting && !bookingSent && !bookingSlots.includes(time)) setTime(bookingSlots[0] || "");
  }, [bookingSlots, bookingSent, bookingSubmitting, time]);

  useEffect(() => {
    if (!waitlistSubmitting && !waitlistSent && !bookingWaitlistSlots.includes(waitlistTime)) {
      setWaitlistTime(bookingWaitlistSlots[0] || "");
    }
  }, [bookingWaitlistSlots, waitlistSent, waitlistSubmitting, waitlistTime]);

  const resetBookingAttempt = () => {
    setBookingSent(false);
    setBookingError("");
    setIdempotencyKey(createServiceBookingIdempotencyKey());
  };

  const resetWaitlistAttempt = () => {
    setWaitlistSent(false);
    setWaitlistActionError("");
    setWaitlistIdempotencyKey(createServiceWaitlistIdempotencyKey());
  };

  const isSelectableDate = (date: string) => date >= todayDate
    && allowedWeekdays.has(parseDateKey(date).getDay())
    && (slotsForDate(date).length > 0 || waitlistSlotsForDate(date).length > 0);

  const chooseDate = (date: string) => {
    if (!isSelectableDate(date)) return;
    const slots = slotsForDate(date);
    const waitlistSlots = waitlistSlotsForDate(date);
    setBookingDate(date);
    setTime(slots[0] || "");
    setWaitlistTime(waitlistSlots[0] || "");
    resetBookingAttempt();
    resetWaitlistAttempt();
  };

  const chooseCardDate = (date: string) => {
    if (!isSelectableDate(date)) return;
    const slots = slotsForDate(date);
    const waitlistSlots = waitlistSlotsForDate(date);
    setCardDate(date);
    setBookingDate(date);
    setTime(slots[0] || "");
    setWaitlistTime(waitlistSlots[0] || "");
    resetBookingAttempt();
    resetWaitlistAttempt();
    setCompactCalendarOpen(false);
  };

  const moveMonth = (offset: number) => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const next = new Date(year, month - 1 + offset, 1, 12);
    const nextKey = monthKey(next);
    if (nextKey < todayDate.slice(0, 7)) return;
    setCalendarMonth(nextKey);
  };

  const openBooking = (date = cardDate, selectedTime?: string) => {
    const slots = slotsForDate(date);
    const waitlistSlots = waitlistSlotsForDate(date);
    setBookingDate(date);
    setCalendarMonth(date.slice(0, 7));
    setTime(selectedTime && slots.includes(selectedTime) ? selectedTime : slots[0] || "");
    setWaitlistTime(waitlistSlots[0] || "");
    resetBookingAttempt();
    resetWaitlistAttempt();
    setBookingOpen(true);
  };

  const bookingResultMessage = (result: SubmitServiceBookingResultCode) => {
    if (result === "slot_taken") return labels.slotTaken;
    if (result === "slot_blocked") return labels.slotBlocked;
    if (result === "slot_unavailable") return labels.slotUnavailable;
    if (result === "service_unavailable") return labels.serviceUnavailable;
    return labels.bookingFailed;
  };

  const waitlistResultMessage = (result: JoinServiceWaitlistResultCode) => {
    if (result === "slot_available") return waitlistLabels.slotAvailable;
    if (result === "already_booked") return waitlistLabels.alreadyBooked;
    if (result === "slot_unavailable") return waitlistLabels.slotUnavailable;
    return waitlistLabels.unavailable;
  };

  const submitWaitlist = async () => {
    if (!waitlistTime || waitlistSubmitting || waitlistSent || waitlistable?.source !== "server") return;
    setWaitlistSubmitting(true);
    setWaitlistActionError("");
    try {
      const result = await joinServiceWaitlist({
        profileId: professional.profileId,
        serviceId: professional.serviceId,
        date: bookingDate,
        time: waitlistTime,
        idempotencyKey: waitlistIdempotencyKey,
      });
      if (result.result === "joined" || result.result === "existing") {
        setWaitlistSent(true);
      } else {
        setWaitlistActionError(waitlistResultMessage(result.result));
        setWaitlistIdempotencyKey(createServiceWaitlistIdempotencyKey());
      }
      setAvailabilityRevision((value) => value + 1);
    } catch {
      setWaitlistActionError(waitlistLabels.unavailable);
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  const submitBooking = async () => {
    if (!bookingFormValid || bookingSubmitting) return;
    setBookingSubmitting(true);
    setBookingError("");
    try {
      const result = await submitServiceBooking({
        profileId: professional.profileId,
        serviceId: professional.serviceId,
        professionalName: professional.displayName,
        serviceName: professional.serviceName,
        clientName: bookingName.trim(),
        clientContact: bookingContact.trim(),
        contactBeforeConfirmation,
        date: bookingDate,
        time,
        durationMinutes: professional.durationMinutes,
        priceCzk: professional.priceCzk,
        currency: professional.currency,
        publicLocation: professional.publicLocation,
        idempotencyKey,
      });
      if (["created", "existing", "local_created"].includes(result.result)) {
        setBookingSent(true);
      } else {
        setBookingError(bookingResultMessage(result.result));
        setIdempotencyKey(createServiceBookingIdempotencyKey());
      }
      setAvailabilityRevision((value) => value + 1);
    } catch {
      setBookingError(labels.bookingFailed);
    } finally {
      setBookingSubmitting(false);
    }
  };

  const selectService = (item: ServicesProfessional) => {
    setSelectedServiceKey(serviceKey(item));
    setServicesOpen(false);
  };

  const openMap = () => window.open(`https://mapy.cz/zakladni?q=${encodeURIComponent(professional.publicLocation)}`, "_blank", "noopener,noreferrer");

  const details = detailsOpen ? createPortal(<div className="service-sheet-backdrop" onPointerDown={() => setDetailsOpen(false)}>
    <article className="service-activity-sheet" onPointerDown={(event) => event.stopPropagation()}>
      <button className="service-sheet-close" type="button" aria-label={labels.close} onClick={() => setDetailsOpen(false)}><X /></button>
      <div className="service-sheet-hero">{artwork ? <img src={artwork.sheet} alt="" /> : <span>{avatar}</span>}<div><small>{professional.serviceName}</small><h2>{professional.displayName}</h2></div></div>
      <div className="service-sheet-grid">
        <div><UserRound /><span><small>{labels.master}</small><strong>{professional.displayName}</strong></span></div>
        <div><CalendarDays /><span><small>{labels.date}</small><strong>{formatCompactDate(cardDate, language)}</strong></span></div>
        <div><Ticket /><span><small>{labels.price}</small><strong>{professional.priceCzk} {professional.currency}</strong></span></div>
        <button type="button" onClick={openMap}><MapPin /><span><small>{labels.address}</small><strong>{localizedLocation}</strong></span></button>
        <div><Clock3 /><span><small>{labels.duration}</small><strong>{professional.durationMinutes} min</strong></span></div>
        <div><UsersRound /><span><small>{labels.slots}</small><strong>{slotSummary}</strong></span></div>
      </div>
      {artwork && <img className="service-sheet-portfolio" src={artwork.portfolio} alt="" />}
      <button className="service-sheet-book" type="button" onClick={() => { setDetailsOpen(false); openBooking(); }}>{labels.book}</button>
    </article>
  </div>, document.body) : null;

  const booking = bookingOpen ? createPortal(<div className="service-sheet-backdrop" onPointerDown={() => setBookingOpen(false)}>
    <section className="service-booking-sheet service-booking-calendar-sheet" role="dialog" aria-modal="true" onPointerDown={(event) => event.stopPropagation()}>
      <button className="service-sheet-close" type="button" aria-label={labels.close} onClick={() => setBookingOpen(false)}><X /></button>
      <h2>{labels.booking}</h2><p>{professional.displayName}</p>
      <button className="service-booking-service-select" type="button" onClick={() => { resetBookingAttempt(); setServicesOpen(true); }}>
        <span>{labels.selectService}</span>
        <strong>{professional.serviceName}</strong>
        <small>{professional.durationMinutes} min · {professional.priceCzk} CZK</small>
      </button>
      <div className="service-booking-contact-grid">
        <label><span>{labels.name} *</span><input required value={bookingName} onChange={(event) => { setBookingName(event.target.value); resetBookingAttempt(); }} placeholder={labels.required} /></label>
        <label><span>{labels.contact} *</span><input required value={bookingContact} onChange={(event) => { setBookingContact(event.target.value); resetBookingAttempt(); }} placeholder="Telegram / phone / email" /></label>
      </div>
      <label className="service-booking-contact-preference">
        <input type="checkbox" checked={contactBeforeConfirmation} onChange={(event) => { setContactBeforeConfirmation(event.target.checked); resetBookingAttempt(); }} />
        <span className="service-booking-contact-preference-box" aria-hidden="true">{contactBeforeConfirmation && <Check />}</span>
        <span>{labels.contactBeforeConfirmation}</span>
      </label>
      <div className="service-calendar-toolbar">
        <button type="button" aria-label={labels.previousMonth} onClick={() => moveMonth(-1)} disabled={calendarMonth <= todayDate.slice(0, 7)}><ChevronLeft /></button>
        <input aria-label={labels.chooseDate} type="month" min={todayDate.slice(0, 7)} value={calendarMonth} onChange={(event) => setCalendarMonth(event.target.value || todayDate.slice(0, 7))} />
        <button type="button" aria-label={labels.nextMonth} onClick={() => moveMonth(1)}><ChevronRight /></button>
      </div>
      <div className="service-calendar-weekdays">{weekdayLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
      <div className="service-calendar-grid">{days.map((date, index) => date ? <button
        className={date === bookingDate ? "is-selected" : ""}
        type="button"
        key={date}
        disabled={!isSelectableDate(date)}
        onClick={() => chooseDate(date)}
      ><span>{parseDateKey(date).getDate()}</span><small>{slotsForDate(date).length || "—"}</small></button> : <span key={`empty-${index}`} />)}</div>
      <div className="service-booking-selected"><CalendarDays /><strong>{formatCompactDate(bookingDate, language)}</strong><span>{labels.chooseTime}</span></div>
      {availabilityLoading ? <div className="service-booking-empty">{labels.loadingSlots}</div> : availabilityError ? <>
        <div className="service-booking-empty">{labels.availabilityError}</div>
        <button className="service-sheet-book" type="button" onClick={() => setAvailabilityRevision((value) => value + 1)}>{labels.retry}</button>
      </> : <>
        <div className="service-booking-slots">{bookingSlots.map((slot) => <button className={time === slot ? "is-selected" : ""} type="button" key={slot} onClick={() => { setTime(slot); resetBookingAttempt(); }}>{slot}</button>)}</div>
        {!bookingSlots.length && <div className="service-booking-empty">{labels.noSlots}</div>}
        {availability?.source !== "server" && <div className="service-booking-empty">{labels.localMode}</div>}
      </>}
      {waitlistLoading && availability?.source === "server" && <div className="service-booking-empty">{waitlistLabels.loading}</div>}
      {waitlistLoadError && availability?.source === "server" && <div className="service-booking-empty">{waitlistLabels.unavailable}</div>}
      {waitlistable?.source === "server" && bookingWaitlistSlots.length > 0 && <>
        <div className="service-booking-empty"><strong>{waitlistLabels.label}</strong><br />{waitlistLabels.hint} {waitlistLabels.notReserved}</div>
        <div className="service-booking-slots">{bookingWaitlistSlots.map((slot) => <button className={waitlistTime === slot ? "is-selected" : ""} type="button" key={"waitlist-" + slot} onClick={() => { setWaitlistTime(slot); resetWaitlistAttempt(); }}>{slot}</button>)}</div>
        {waitlistSent
          ? <div className="service-booking-success"><Check />{waitlistLabels.joined} {waitlistLabels.notReserved}</div>
          : <button className="service-sheet-book" type="button" disabled={!waitlistTime || waitlistSubmitting} onClick={() => void submitWaitlist()}><BellRing />{waitlistSubmitting ? waitlistLabels.joining : waitlistLabels.join}</button>}
      </>}
      {waitlistActionError && <div className="service-booking-empty">{waitlistActionError}</div>}
      {bookingError && <div className="service-booking-empty">{bookingError}</div>}
      {bookingSent ? <div className="service-booking-success"><Check />{labels.sent}</div> : <button className="service-sheet-book" type="button" onClick={() => void submitBooking()} disabled={!bookingFormValid || availabilityLoading || availabilityError}><CalendarPlus />{bookingSubmitting ? labels.sending : labels.send}</button>}
    </section>
  </div>, document.body) : null;

  const servicePicker = servicesOpen ? createPortal(<div className="service-popup-backdrop" onPointerDown={() => setServicesOpen(false)}>
    <section className="service-popup-panel service-picker-popover" role="dialog" aria-modal="true" aria-label={labels.selectService} onPointerDown={(event) => event.stopPropagation()}>
      <button className="service-popup-close" type="button" aria-label={labels.close} onClick={() => setServicesOpen(false)}><X /></button>
      <h3>{labels.selectService}</h3>
      <div className="service-picker-list">{options.map((item) => {
        const active = serviceKey(item) === serviceKey(professional);
        const free = slotsForDate(cardDate, item).length;
        return <button className={active ? "is-selected" : ""} type="button" key={serviceKey(item)} onClick={() => selectService(item)}>
          <span><strong>{item.serviceName}</strong><small>{item.durationMinutes} min · {free} {labels.slots.toLowerCase()}</small></span>
          <b>{item.priceCzk} {item.currency}</b>
        </button>;
      })}</div>
    </section>
  </div>, document.body) : null;

  const slotsPicker = slotsOpen ? createPortal(<div className="service-popup-backdrop" onPointerDown={() => setSlotsOpen(false)}>
    <section className="service-popup-panel service-slots-popover" role="dialog" aria-modal="true" aria-label={labels.slots} onPointerDown={(event) => event.stopPropagation()}>
      <button className="service-popup-close" type="button" aria-label={labels.close} onClick={() => setSlotsOpen(false)}><X /></button>
      <h3>{labels.slots}</h3><p>{professional.serviceName} · {formatCompactDate(cardDate, language)}</p>
      <div className="service-free-slots-list" role="list">{availabilityLoading ? <span>{labels.loadingSlots}</span> : availabilityError ? <span>{labels.availabilityError}</span> : cardSlots.length ? cardSlots.map((slot) => <button type="button" key={slot} onClick={() => { setSlotsOpen(false); openBooking(cardDate, slot); }}>{slot}</button>) : <span>{labels.noSlots}</span>}</div>
    </section>
  </div>, document.body) : null;

  const compactCalendar = compactCalendarOpen ? createPortal(<div className="service-popup-backdrop" onPointerDown={() => setCompactCalendarOpen(false)}>
    <section className="service-popup-panel service-card-calendar-popover" role="dialog" aria-modal="true" aria-label={labels.chooseDate} onPointerDown={(event) => event.stopPropagation()}>
      <button className="service-popup-close" type="button" aria-label={labels.close} onClick={() => setCompactCalendarOpen(false)}><X /></button>
      <div className="service-card-calendar-toolbar">
        <button type="button" aria-label={labels.previousMonth} onClick={() => moveMonth(-1)} disabled={calendarMonth <= todayDate.slice(0, 7)}><ChevronLeft /></button>
        <strong>{new Intl.DateTimeFormat(locale[language], { month: "long", year: "numeric" }).format(parseDateKey(`${calendarMonth}-01`))}</strong>
        <button type="button" aria-label={labels.nextMonth} onClick={() => moveMonth(1)}><ChevronRight /></button>
      </div>
      <div className="service-card-calendar-weekdays">{weekdayLabels.map((label, index) => <span key={`compact-${label}-${index}`}>{label}</span>)}</div>
      <div className="service-card-calendar-grid">{days.map((date, index) => date ? <button
        className={date === cardDate ? "is-selected" : ""}
        type="button"
        key={`compact-${date}`}
        disabled={!isSelectableDate(date)}
        onClick={() => chooseCardDate(date)}
      >{parseDateKey(date).getDate()}</button> : <span key={`compact-empty-${index}`} />)}</div>
      {availabilityLoading && <div className="service-booking-empty">{labels.loadingSlots}</div>}
      {availabilityError && <div className="service-booking-empty">{labels.availabilityError}</div>}
    </section>
  </div>, document.body) : null;

  return <>
    <article className="services-professional-card service-activity-card">
      <div className="services-professional-artwork" aria-hidden="true">{cardArtwork ? <img src={cardArtwork} alt="" decoding="async" /> : <span>{avatar}</span>}</div>
      <div className="services-professional-top-actions">
        <ServiceReminderAction professional={professional} date={cardDate} time={nextSlot} language={language} />
        <CardShareAction title={professional.displayName} date={`${formatCompactDate(cardDate, language)} · ${nextSlot}`} address={localizedLocation} url={url} label={labels.book} selectedDate={cardDate} />
      </div>
      <div className="service-card-right-stack">
        <button className="service-free-slots-badge" type="button" aria-expanded={slotsOpen} onClick={() => setSlotsOpen((value) => !value)}><UsersRound /><strong>{slotSummary}</strong></button>
        <div className="service-duration-badge"><Clock3 /><strong>{professional.durationMinutes}</strong><span>min</span></div>
      </div>
      <button className="services-professional-main" type="button" onClick={() => setDetailsOpen(true)}><strong>{professional.displayName}</strong><span>{professional.serviceName}</span></button>
      <div className="services-professional-meta service-professional-meta-row">
        <div className="service-master-avatar" aria-label={professional.displayName}><span>{avatar}</span></div>
        <button className="service-meta-item service-meta-date-item" type="button" aria-expanded={compactCalendarOpen} onClick={() => { setCalendarMonth(cardDate.slice(0, 7)); setCompactCalendarOpen(true); }}><CalendarDays /><strong>{formatCompactDate(cardDate, language)}</strong></button>
        <div className="service-meta-item service-price"><Ticket /><strong>{professional.priceCzk} {professional.currency}</strong></div>
        <button className="service-meta-item service-location" type="button" onClick={openMap}><MapPin /><strong><span className="service-location-city">{localizedCity}</span><span className="service-location-address">{locationDetail}</span></strong></button>
      </div>
      <div className="services-professional-actions"><button className="secondary" type="button" onClick={() => setServicesOpen(true)}><Scissors />{labels.services}</button><button className="primary" type="button" onClick={() => openBooking()}><CalendarPlus />{labels.book}</button></div>
    </article>
    {details}{booking}{servicePicker}{slotsPicker}{compactCalendar}
  </>;
}
