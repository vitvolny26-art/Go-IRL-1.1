import { createPortal } from "react-dom";
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Film,
  Info,
  Languages,
  MapPin,
  Share2,
  Star,
  X,
} from "lucide-react";
import { getCurrentUserKey } from "../../authSession";
import type { Language } from "../../types";
import {
  cinemaScreeningActionUrl,
  cinemaScreeningTags,
  cinemaStringList,
  groupCinemaPosterMovies,
  selectCinemaPosterRows,
  type CinemaPosterMovieGroup,
  type CinemaPosterTimeFilter,
  type CityPosterCinemaRow,
} from "./cinemaModel";
import { loadCityPostersCinema } from "./cinemaRepository";
import {
  loadCinemaPlanned,
  removeCinemaPlanned,
  setCinemaPlannedDate,
} from "./cinemaPlanned";
import "./cinema-posters.css";

export type CinemaPosterCardVariant = "for-you" | "catalog" | "planned";

const localeByLanguage: Record<Language, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  cs: "cs-CZ",
  en: "en-US",
  pl: "pl-PL",
  sk: "sk-SK",
};

const copy: Record<Language, {
  loading: string;
  error: string;
  empty: string;
  plannedEmpty: string;
  schedule: string;
  about: string;
  min: string;
  screenings: string;
  share: string;
  rating: string;
  duration: string;
  language: string;
  date: string;
  cinemas: string;
  details: string;
  wantToGo: string;
  planned: string;
  removePlan: string;
  close: string;
  previousMonth: string;
  nextMonth: string;
  chooseDate: string;
  tickets: string;
  copied: string;
}> = {
  ru: { loading: "Загружаем кино…", error: "Не удалось загрузить киноафишу.", empty: "Подходящих фильмов пока нет.", plannedEmpty: "Вы ещё не добавили фильмы в планы.", schedule: "Сеансы", about: "О фильме", min: "мин", screenings: "сеансов", share: "Поделиться", rating: "Рейтинг", duration: "Длительность", language: "Язык", date: "Дата", cinemas: "Кинотеатры", details: "Подробнее", wantToGo: "Хочу пойти", planned: "Запланировано", removePlan: "Убрать из планов", close: "Закрыть", previousMonth: "Предыдущий месяц", nextMonth: "Следующий месяц", chooseDate: "Выберите дату", tickets: "Билеты", copied: "Ссылка скопирована" },
  uk: { loading: "Завантажуємо кіно…", error: "Не вдалося завантажити кіноафішу.", empty: "Підходящих фільмів поки немає.", plannedEmpty: "Ви ще не додали фільми до планів.", schedule: "Сеанси", about: "Про фільм", min: "хв", screenings: "сеансів", share: "Поділитися", rating: "Рейтинг", duration: "Тривалість", language: "Мова", date: "Дата", cinemas: "Кінотеатри", details: "Докладніше", wantToGo: "Хочу піти", planned: "Заплановано", removePlan: "Прибрати з планів", close: "Закрити", previousMonth: "Попередній місяць", nextMonth: "Наступний місяць", chooseDate: "Оберіть дату", tickets: "Квитки", copied: "Посилання скопійовано" },
  cs: { loading: "Načítáme kino…", error: "Program kina se nepodařilo načíst.", empty: "Zatím nejsou vhodné filmy.", plannedEmpty: "Zatím nemáte žádný film v plánu.", schedule: "Program", about: "O filmu", min: "min", screenings: "projekcí", share: "Sdílet", rating: "Hodnocení", duration: "Délka", language: "Jazyk", date: "Datum", cinemas: "Kina", details: "Detail", wantToGo: "Chci jít", planned: "Naplánováno", removePlan: "Odebrat z plánů", close: "Zavřít", previousMonth: "Předchozí měsíc", nextMonth: "Další měsíc", chooseDate: "Vyberte datum", tickets: "Vstupenky", copied: "Odkaz zkopírován" },
  en: { loading: "Loading cinema…", error: "Cinema listings could not be loaded.", empty: "No matching movies yet.", plannedEmpty: "You have not planned any movies yet.", schedule: "Showtimes", about: "About", min: "min", screenings: "shows", share: "Share", rating: "Rating", duration: "Duration", language: "Language", date: "Date", cinemas: "Cinemas", details: "Details", wantToGo: "Want to go", planned: "Planned", removePlan: "Remove from plans", close: "Close", previousMonth: "Previous month", nextMonth: "Next month", chooseDate: "Choose a date", tickets: "Tickets", copied: "Link copied" },
  pl: { loading: "Ładowanie kina…", error: "Nie udało się wczytać repertuaru kina.", empty: "Brak pasujących filmów.", plannedEmpty: "Nie masz jeszcze zaplanowanych filmów.", schedule: "Seanse", about: "O filmie", min: "min", screenings: "seansów", share: "Udostępnij", rating: "Ocena", duration: "Czas", language: "Język", date: "Data", cinemas: "Kina", details: "Szczegóły", wantToGo: "Chcę iść", planned: "Zaplanowane", removePlan: "Usuń z planów", close: "Zamknij", previousMonth: "Poprzedni miesiąc", nextMonth: "Następny miesiąc", chooseDate: "Wybierz datę", tickets: "Bilety", copied: "Link skopiowany" },
  sk: { loading: "Načítava sa kino…", error: "Program kina sa nepodarilo načítať.", empty: "Zatiaľ nie sú vhodné filmy.", plannedEmpty: "Zatiaľ nemáte žiadny film v pláne.", schedule: "Program", about: "O filme", min: "min", screenings: "premietaní", share: "Zdieľať", rating: "Hodnotenie", duration: "Dĺžka", language: "Jazyk", date: "Dátum", cinemas: "Kiná", details: "Detail", wantToGo: "Chcem ísť", planned: "Naplánované", removePlan: "Odobrať z plánov", close: "Zavrieť", previousMonth: "Predchádzajúci mesiac", nextMonth: "Ďalší mesiac", chooseDate: "Vyberte dátum", tickets: "Vstupenky", copied: "Odkaz skopírovaný" },
};

const formatDate = (dateKey: string, language: Language, long = false) => {
  const value = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(value.getTime())) return dateKey;
  return new Intl.DateTimeFormat(localeByLanguage[language], long
    ? { weekday: "long", day: "numeric", month: "long" }
    : { weekday: "short", day: "numeric", month: "short" }).format(value);
};

const formatMonth = (monthKey: string, language: Language) => {
  const value = new Date(`${monthKey}-01T12:00:00`);
  return new Intl.DateTimeFormat(localeByLanguage[language], { month: "long", year: "numeric" }).format(value);
};

const addMonths = (monthKey: string, amount: number) => {
  const [year, month] = monthKey.split("-").map(Number);
  const value = new Date(year, month - 1 + amount, 1, 12);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
};

const monthDays = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1, 12);
  const count = new Date(year, month, 0, 12).getDate();
  const offset = (first.getDay() + 6) % 7;
  const values: Array<string | null> = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= count; day += 1) values.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  return values;
};

const weekdayLabels = (language: Language) => {
  const monday = new Date("2026-09-14T12:00:00");
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(monday);
    value.setDate(monday.getDate() + index);
    return new Intl.DateTimeFormat(localeByLanguage[language], { weekday: "short" }).format(value).replace(".", "");
  });
};

const rowsForDate = (group: CinemaPosterMovieGroup, date: string) => group.rows.filter((row) => row.local_date === date);
const availableDates = (group: CinemaPosterMovieGroup) => [...new Set(group.rows.map((row) => row.local_date))].sort();
const venueNamesForDate = (group: CinemaPosterMovieGroup, date: string) => [...new Set(rowsForDate(group, date).map((row) => row.cinema_name))];
const languageLabelForDate = (group: CinemaPosterMovieGroup, date: string) => {
  const values = [...new Set(rowsForDate(group, date).map((row) => String(row.audio_language || "").trim().toUpperCase()).filter(Boolean))];
  return values.length ? values.join("/") : "—";
};

const ratingLabel = (row: CityPosterCinemaRow) => row.imdb_rating ? Number(row.imdb_rating).toFixed(1) : "—";

const shareMovie = async (group: CinemaPosterMovieGroup, date: string, language: Language) => {
  const row = group.rows[0];
  const cinemas = venueNamesForDate(group, date);
  const text = [row.movie_title, formatDate(date, language, true), cinemas.join(", ")].filter(Boolean).join(" · ");
  const url = typeof window === "undefined" ? "" : window.location.href;
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title: row.movie_title, text, url });
      return;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText([text, url].filter(Boolean).join("\n"));
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = [text, url].filter(Boolean).join("\n");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
};

function ScreeningSchedule({ rows }: { rows: CityPosterCinemaRow[] }) {
  const venues = new Map<string, CityPosterCinemaRow[]>();
  rows.forEach((row) => venues.set(row.cinema_id, [...(venues.get(row.cinema_id) || []), row]));

  return (
    <div className="cinema-details-venues">
      {[...venues.values()].map((venueRows) => {
        const venue = venueRows[0];
        return (
          <section className="cinema-details-venue" key={venue.cinema_id}>
            <div className="cinema-details-venue-heading">
              <div><strong>{venue.cinema_name}</strong>{venue.cinema_address ? <span><MapPin />{venue.cinema_address}</span> : null}</div>
              <small>{venueRows.length}</small>
            </div>
            <div className="cinema-details-times">
              {venueRows.map((screening) => {
                const href = cinemaScreeningActionUrl(screening);
                const tags = cinemaScreeningTags(screening);
                const content = <><strong>{screening.local_time}</strong>{tags.length ? <span>{tags.join(" · ")}</span> : null}</>;
                return href ? <a key={screening.screening_id} href={href} target="_blank" rel="noopener noreferrer">{content}</a> : <span className="is-static" key={screening.screening_id}>{content}</span>;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CinemaDateCalendar({
  group,
  language,
  selectedDate,
  onSelect,
  onClose,
}: {
  group: CinemaPosterMovieGroup;
  language: Language;
  selectedDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const dates = availableDates(group);
  const firstMonth = (selectedDate || dates[0] || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const [calendarMonth, setCalendarMonth] = useState(firstMonth);
  const dateSet = useMemo(() => new Set(dates), [dates]);
  const t = copy[language];

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="cinema-sheet-backdrop" onPointerDown={onClose}>
      <section className="cinema-calendar-popover" role="dialog" aria-modal="true" aria-label={t.chooseDate} onPointerDown={(event: ReactPointerEvent<HTMLElement>) => event.stopPropagation()}>
        <button className="cinema-sheet-close" type="button" aria-label={t.close} onClick={onClose}><X /></button>
        <div className="cinema-calendar-toolbar">
          <button type="button" aria-label={t.previousMonth} onClick={() => setCalendarMonth((value) => addMonths(value, -1))}><ChevronLeft /></button>
          <strong>{formatMonth(calendarMonth, language)}</strong>
          <button type="button" aria-label={t.nextMonth} onClick={() => setCalendarMonth((value) => addMonths(value, 1))}><ChevronRight /></button>
        </div>
        <div className="cinema-calendar-weekdays">{weekdayLabels(language).map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
        <div className="cinema-calendar-grid">{monthDays(calendarMonth).map((date, index) => date ? <button
          className={date === selectedDate ? "is-selected" : ""}
          type="button"
          key={date}
          disabled={!dateSet.has(date)}
          onClick={() => { onSelect(date); onClose(); }}
        ><span>{Number(date.slice(-2))}</span><small>{rowsForDate(group, date).length || ""}</small></button> : <span key={`empty-${index}`} />)}</div>
      </section>
    </div>,
    document.body,
  );
}

function CinemaMovieDetails({
  group,
  language,
  selectedDate,
  planned,
  onDateChange,
  onClose,
  onPlan,
}: {
  group: CinemaPosterMovieGroup;
  language: Language;
  selectedDate: string;
  planned: boolean;
  onDateChange: (date: string) => void;
  onClose: () => void;
  onPlan: () => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const row = group.rows[0];
  const t = copy[language];
  const dayRows = rowsForDate(group, selectedDate);
  const genres = cinemaStringList(row.genres);
  const venueNames = venueNamesForDate(group, selectedDate);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="cinema-details-page" role="dialog" aria-modal="true" aria-label={row.movie_title}>
      <header className="cinema-details-header">
        <button type="button" aria-label={t.close} onClick={onClose}><ChevronLeft /></button>
        <strong>{row.movie_title}</strong>
        <button type="button" aria-label={t.share} onClick={() => void shareMovie(group, selectedDate, language)}><Share2 /></button>
      </header>
      <main className="cinema-details-content">
        <div className="cinema-details-hero">
          <div className="cinema-details-poster">{row.poster_url ? <img src={row.poster_url} alt={row.movie_title} /> : <Film />}</div>
          <div className="cinema-details-heading">
            <h1>{row.movie_title}</h1>
            {row.original_title && row.original_title !== row.movie_title ? <p>{row.original_title}</p> : null}
            <div className="cinema-details-facts">
              {row.release_year ? <span>{row.release_year}</span> : null}
              {row.age_rating ? <span>{row.age_rating}</span> : null}
              {genres.map((genre) => <span key={genre}>{genre}</span>)}
            </div>
          </div>
        </div>

        <div className="cinema-details-badges">
          <button type="button" onClick={() => void shareMovie(group, selectedDate, language)}><Share2 /><span>{t.share}</span></button>
          <div><Star /><span>{t.rating}</span><strong>{ratingLabel(row)}</strong></div>
          <div><Clock3 /><span>{t.duration}</span><strong>{row.duration_minutes ? `${row.duration_minutes} ${t.min}` : "—"}</strong></div>
          <div><Languages /><span>{t.language}</span><strong>{languageLabelForDate(group, selectedDate)}</strong></div>
        </div>

        {row.description ? <section className="cinema-details-about"><h2>{t.about}</h2><p>{row.description}</p></section> : null}

        <section className="cinema-details-schedule-section">
          <div className="cinema-details-section-heading"><div><small>{t.schedule}</small><h2>{formatDate(selectedDate, language, true)}</h2></div><button type="button" onClick={() => setCalendarOpen(true)}><CalendarDays />{t.chooseDate}</button></div>
          <ScreeningSchedule rows={dayRows} />
        </section>
      </main>
      <footer className="cinema-details-sticky-actions">
        <div><CalendarDays /><span><small>{t.date}</small><strong>{formatDate(selectedDate, language)}</strong></span></div>
        <div><MapPin /><span><small>{t.cinemas}</small><strong>{venueNames.join(", ") || "—"}</strong></span></div>
        <button className={planned ? "is-planned" : ""} type="button" onClick={onPlan}>{planned ? <Check /> : <CalendarCheck />}{planned ? t.planned : t.wantToGo}</button>
      </footer>
      {calendarOpen ? <CinemaDateCalendar group={group} language={language} selectedDate={selectedDate} onSelect={onDateChange} onClose={() => setCalendarOpen(false)} /> : null}
    </div>,
    document.body,
  );
}

function ForYouMovieCard({
  group,
  language,
  plannedDate,
  planPending,
  onTogglePlan,
}: {
  group: CinemaPosterMovieGroup;
  language: Language;
  plannedDate?: string;
  planPending: boolean;
  onTogglePlan: (movieId: string, date: string, planned: boolean) => void;
}) {
  const dates = availableDates(group);
  const [selectedDate, setSelectedDate] = useState(
    plannedDate && dates.includes(plannedDate) ? plannedDate : (dates[0] || ""),
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const row = group.rows[0];
  const t = copy[language];
  const venueNames = venueNamesForDate(group, selectedDate);
  const planned = plannedDate === selectedDate;

  const togglePlan = () => onTogglePlan(group.movieId, selectedDate, planned);

  return <>
    <article className="cinema-for-you-card">
      <div className="cinema-for-you-artwork" aria-hidden="true">{row.poster_url ? <img src={row.poster_url} alt="" loading="lazy" decoding="async" /> : <Film />}</div>
      <div className="cinema-for-you-scrim" />
      <div className="cinema-for-you-top-badges">
        <button type="button" className="cinema-card-badge cinema-share-badge" onClick={() => void shareMovie(group, selectedDate, language)}><Share2 /><span>{t.share}</span></button>
        <div className="cinema-for-you-metric-stack">
          <div className="cinema-card-badge"><Star /><span>{t.rating}</span><strong>{ratingLabel(row)}</strong></div>
          <div className="cinema-card-badge"><Clock3 /><span>{t.duration}</span><strong>{row.duration_minutes ? `${row.duration_minutes} ${t.min}` : "—"}</strong></div>
          <div className="cinema-card-badge"><Languages /><span>{t.language}</span><strong>{languageLabelForDate(group, selectedDate)}</strong></div>
        </div>
      </div>
      <button className="cinema-for-you-title" type="button" onClick={() => setDetailsOpen(true)}>
        <strong>{row.movie_title}</strong>
        {row.original_title && row.original_title !== row.movie_title ? <span>{row.original_title}</span> : null}
      </button>
      <div className="cinema-for-you-bottom-panel">
        <button className="cinema-for-you-meta" type="button" onClick={() => setCalendarOpen(true)}>
          <CalendarDays /><span><small>{t.date}</small><strong>{formatDate(selectedDate, language)}</strong></span>
        </button>
        <div className="cinema-for-you-meta"><MapPin /><span><small>{t.cinemas}</small><strong>{venueNames.length === 1 ? venueNames[0] : `${venueNames.length} · ${venueNames.slice(0, 2).join(", ")}`}</strong></span></div>
        <div className="cinema-for-you-actions">
          <button className="secondary" type="button" onClick={() => setDetailsOpen(true)}><Info />{t.details}</button>
          <button className={planned ? "primary is-planned" : "primary"} type="button" onClick={togglePlan} disabled={planPending} aria-busy={planPending}>{planned ? <Check /> : <CalendarCheck />}{planned ? t.planned : t.wantToGo}</button>
        </div>
      </div>
    </article>
    {calendarOpen ? <CinemaDateCalendar group={group} language={language} selectedDate={selectedDate} onSelect={setSelectedDate} onClose={() => setCalendarOpen(false)} /> : null}
    {detailsOpen ? <CinemaMovieDetails group={group} language={language} selectedDate={selectedDate} planned={planned} onDateChange={setSelectedDate} onClose={() => setDetailsOpen(false)} onPlan={togglePlan} /> : null}
  </>;
}

function CatalogMovieCard({
  group,
  language,
  plannedDate,
  initialDate,
  plannedSurface = false,
  planPending,
  onTogglePlan,
}: {
  group: CinemaPosterMovieGroup;
  language: Language;
  plannedDate?: string;
  initialDate?: string;
  plannedSurface?: boolean;
  planPending: boolean;
  onTogglePlan: (movieId: string, date: string, planned: boolean) => void;
}) {
  const dates = availableDates(group);
  const preferredDate = plannedSurface && plannedDate && dates.includes(plannedDate)
    ? plannedDate
    : initialDate && dates.includes(initialDate)
      ? initialDate
      : (dates[0] || "");
  const [selectedDate, setSelectedDate] = useState(preferredDate);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const row = group.rows[0];
  const t = copy[language];
  const genres = cinemaStringList(row.genres).slice(0, 2);
  const venues = venueNamesForDate(group, selectedDate);
  const planned = plannedDate === selectedDate;

  const togglePlan = () => {
    if (plannedSurface && plannedDate) {
      onTogglePlan(group.movieId, plannedDate, true);
      return;
    }
    onTogglePlan(group.movieId, selectedDate, planned);
  };
  const detailsPlanned = plannedSurface ? Boolean(plannedDate) : planned;

  return <>
    <article className={plannedSurface ? "cinema-catalog-card is-planned" : "cinema-catalog-card"}>
      <div className="cinema-catalog-poster">{row.poster_url ? <img src={row.poster_url} alt={row.movie_title} loading="lazy" decoding="async" /> : <Film />}</div>
      <div className="cinema-catalog-body">
        <button className="cinema-catalog-title" type="button" onClick={() => setDetailsOpen(true)}><strong>{row.movie_title}</strong>{row.original_title && row.original_title !== row.movie_title ? <span>{row.original_title}</span> : null}</button>
        <div className="cinema-catalog-facts">
          <span><Star />{ratingLabel(row)}</span>
          {row.duration_minutes ? <span><Clock3 />{row.duration_minutes} {t.min}</span> : null}
          <span><Languages />{languageLabelForDate(group, selectedDate)}</span>
          {genres.map((genre) => <span key={genre}>{genre}</span>)}
        </div>
        <button className="cinema-catalog-date" type="button" onClick={() => setCalendarOpen(true)}><CalendarDays /><strong>{formatDate(selectedDate, language)}</strong><span>{rowsForDate(group, selectedDate).length} {t.screenings}</span></button>
        <div className="cinema-catalog-venues"><MapPin /><span>{venues.join(", ") || "—"}</span></div>
        {plannedSurface ? <button className="cinema-catalog-remove" type="button" disabled={planPending} aria-busy={planPending} onClick={togglePlan}><X />{t.removePlan}</button> : null}
      </div>
    </article>
    {calendarOpen ? <CinemaDateCalendar group={group} language={language} selectedDate={selectedDate} onSelect={setSelectedDate} onClose={() => setCalendarOpen(false)} /> : null}
    {detailsOpen ? <CinemaMovieDetails group={group} language={language} selectedDate={selectedDate} planned={detailsPlanned} onDateChange={setSelectedDate} onClose={() => setDetailsOpen(false)} onPlan={togglePlan} /> : null}
  </>;
}

const futureRows = (rows: CityPosterCinemaRow[]) => {
  const now = Date.now();
  return rows.filter((row) => {
    const startsAt = new Date(row.starts_at).getTime();
    const endsAt = row.ends_at ? new Date(row.ends_at).getTime() : Number.NaN;
    return (Number.isFinite(endsAt) && endsAt >= now)
      || (Number.isFinite(startsAt) && startsAt >= now - 30 * 60_000);
  });
};

const rankForYou = (groups: CinemaPosterMovieGroup[]) => [...groups].sort((left, right) => {
  const leftRow = left.rows[0];
  const rightRow = right.rows[0];
  const score = (group: CinemaPosterMovieGroup, row: CityPosterCinemaRow) => {
    const rating = Number(row.imdb_rating || 0) * 10;
    const dates = new Set(group.rows.map((item) => item.local_date)).size * 4;
    const venues = new Set(group.rows.map((item) => item.cinema_id)).size * 2;
    const poster = row.poster_url ? 3 : 0;
    const description = row.description ? 2 : 0;
    return rating + dates + venues + poster + description;
  };
  return score(right, rightRow) - score(left, leftRow) || left.firstStart.localeCompare(right.firstStart);
});

export function CinemaPostersCatalog({
  cityId,
  language,
  timeFilter = "today",
  query = "",
  variant = "catalog",
}: {
  cityId: string;
  language: Language;
  timeFilter?: CinemaPosterTimeFilter;
  query?: string;
  variant?: CinemaPosterCardVariant;
}) {
  const t = copy[language];
  const queryClient = useQueryClient();
  const plannedUserKey = getCurrentUserKey();
  const cinemaQuery = useQuery({
    queryKey: ["city-posters", "cinema", cityId],
    queryFn: () => loadCityPostersCinema(cityId),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const plannedQuery = useQuery({
    queryKey: ["city-posters", "cinema-planned", plannedUserKey],
    queryFn: () => loadCinemaPlanned(),
    staleTime: 30_000,
    retry: 1,
  });
  const planMutation = useMutation({
    mutationFn: async (action: { type: "set" | "remove"; movieId: string; date: string }) => {
      if (action.type === "remove") return removeCinemaPlanned(cityId, action.movieId);
      return setCinemaPlannedDate(cityId, action.movieId, action.date);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["city-posters", "cinema-planned", plannedUserKey] });
    },
  });

  const plannedItems = plannedQuery.data?.items || [];
  const plannedByMovie = useMemo(() => new Map(plannedItems.filter((item) => item.cityId === cityId).map((item) => [item.movieId, item.date])), [cityId, plannedItems]);
  const togglePlan = (movieId: string, date: string, planned: boolean) => {
    if (planMutation.isPending) return;
    planMutation.mutate({ type: planned ? "remove" : "set", movieId, date });
  };
  const planPendingFor = (movieId: string) => planMutation.isPending && planMutation.variables?.movieId === movieId;

  const catalogSelection = useMemo(() => {
    const rows = cinemaQuery.data || [];
    const filteredRows = selectCinemaPosterRows(rows, { timeFilter, query });
    const initialDates = new Map<string, string>();
    filteredRows.forEach((row) => {
      if (!initialDates.has(row.movie_id)) initialDates.set(row.movie_id, row.local_date);
    });
    const movieIds = new Set(initialDates.keys());
    const groups = groupCinemaPosterMovies(futureRows(rows).filter((row) => movieIds.has(row.movie_id)));
    return { groups, initialDates };
  }, [cinemaQuery.data, query, timeFilter]);

  const groups = useMemo(() => {
    const rows = cinemaQuery.data || [];
    if (variant === "for-you") return rankForYou(groupCinemaPosterMovies(futureRows(rows))).slice(0, 8);
    if (variant === "planned") {
      const available = futureRows(rows);
      const plannedMovieIds = new Set(available
        .filter((row) => plannedByMovie.get(row.movie_id) === row.local_date)
        .map((row) => row.movie_id));
      return groupCinemaPosterMovies(available.filter((row) => plannedMovieIds.has(row.movie_id)));
    }
    return catalogSelection.groups;
  }, [catalogSelection.groups, cinemaQuery.data, plannedByMovie, variant]);

  if (cinemaQuery.isPending || (variant === "planned" && plannedQuery.isPending)) return <div className="city-posters-cinema-state"><span className="city-posters-cinema-loader" />{t.loading}</div>;
  if (cinemaQuery.isError || (variant === "planned" && plannedQuery.isError)) return <div className="city-posters-cinema-state is-error"><Film />{t.error}</div>;
  if (!groups.length) return <div className="city-posters-cinema-state"><Film />{variant === "planned" ? t.plannedEmpty : t.empty}</div>;

  if (variant === "for-you") return <div className="cinema-for-you-grid">{groups.map((group) => <ForYouMovieCard
    group={group}
    language={language}
    plannedDate={plannedByMovie.get(group.movieId)}
    planPending={planPendingFor(group.movieId)}
    onTogglePlan={togglePlan}
    key={group.movieId}
  />)}</div>;

  return <div className="cinema-catalog-grid">{groups.map((group) => <CatalogMovieCard
    group={group}
    language={language}
    plannedDate={plannedByMovie.get(group.movieId)}
    initialDate={variant === "catalog" ? catalogSelection.initialDates.get(group.movieId) : undefined}
    plannedSurface={variant === "planned"}
    planPending={planPendingFor(group.movieId)}
    onTogglePlan={togglePlan}
    key={group.movieId}
  />)}</div>;
}
