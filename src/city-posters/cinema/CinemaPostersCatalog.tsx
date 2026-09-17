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

const displayLanguageCode = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "cs" || normalized === "cz") return "CZ";
  return normalized.toUpperCase();
};

const uniqueLanguageCodes = (values: Array<string | null | undefined>) => [...new Set(values.map(displayLanguageCode).filter(Boolean))];
const audioLanguageLabel = (rows: CityPosterCinemaRow[]) => uniqueLanguageCodes(rows.map((row) => row.audio_language)).join(" · ");
const subtitleLanguageLabel = (rows: CityPosterCinemaRow[]) => {
  const values = uniqueLanguageCodes(rows.flatMap((row) => cinemaStringList(row.subtitle_languages)));
  return values.map((value) => `${value} SUB`).join(" · ");
};

const addLocalDateDays = (dateKey: string, amount: number) => {
  const value = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return dateKey;
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

const rowsForSelectedWeek = (group: CinemaPosterMovieGroup, anchorDate: string) => {
  if (!anchorDate) return [];
  const anchor = new Date(`${anchorDate}T12:00:00Z`);
  if (Number.isNaN(anchor.getTime())) return group.rows;
  const mondayOffset = (anchor.getUTCDay() + 6) % 7;
  const firstDate = addLocalDateDays(anchorDate, -mondayOffset);
  const lastDate = addLocalDateDays(firstDate, 6);
  return group.rows.filter((row) => row.local_date >= firstDate && row.local_date <= lastDate);
};

const formatDurationLabel = (minutes: number | null, language: Language) => {
  const total = Number(minutes || 0);
  if (!Number.isFinite(total) || total <= 0) return "";
  const rounded = Math.round(total);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  const unit = (value: number, unitName: "hour" | "minute") => new Intl.NumberFormat(localeByLanguage[language], {
    style: "unit",
    unit: unitName,
    unitDisplay: "short",
  }).format(value).replace(/\./g, "");
  return [hours ? unit(hours, "hour") : "", remainder ? unit(remainder, "minute") : ""].filter(Boolean).join(" ");
};

const formatCardDate = (dateKey: string, language: Language) => new Intl.DateTimeFormat(localeByLanguage[language], {
  day: "numeric",
  month: "short",
}).format(new Date(`${dateKey}T12:00:00`)).replace(/(\D)\.$/, "$1");

const screeningPeriodLabel = (rows: CityPosterCinemaRow[], language: Language) => {
  const dates = [...new Set(rows.map((row) => row.local_date).filter(Boolean))].sort();
  if (!dates.length) return "";
  const first = formatCardDate(dates[0], language);
  const last = formatCardDate(dates[dates.length - 1], language);
  return first === last ? first : `${first} — ${last}`;
};

// Runtime guard for Telegram/WebView cases where the extracted Cinema stylesheet is not applied.
// The route entry still owns the canonical stylesheet; this only preserves the critical For You
// card + calendar/schedule presentation so the UI cannot collapse into raw document flow again.
const cinemaRuntimeFallbackCss = String.raw`
.cinema-for-you-grid,.cinema-beauty-card-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;min-width:0}
.cinema-for-you-card{position:relative;min-height:clamp(520px,144vw,640px);overflow:hidden;border:1px solid rgba(212,175,55,.34);border-radius:24px;background:#160b20;color:#fff;box-shadow:0 18px 48px rgba(0,0,0,.28);isolation:isolate}
.cinema-catalog-beauty-card.is-planned{border-color:#d4af37}
.cinema-for-you-artwork,.cinema-for-you-artwork img,.cinema-for-you-scrim{position:absolute;inset:0;width:100%;height:100%}
.cinema-for-you-artwork{display:grid;place-items:center;background:#281331}.cinema-for-you-artwork img{object-fit:cover}.cinema-for-you-scrim{z-index:1;background:linear-gradient(180deg,transparent 24%,rgba(22,10,31,.34) 56%,rgba(22,10,31,.94) 88%)}
.cinema-for-you-top-badges{position:absolute;z-index:3;inset:14px 14px auto;display:flex;align-items:flex-start;justify-content:flex-end;gap:10px}
.cinema-share-badge{width:48px;min-width:48px;height:48px;min-height:48px;display:grid;place-items:center;margin-left:auto;padding:0;border:1px solid #d4af37;border-radius:999px;background:rgba(22,11,32,.48);color:#d4af37}.cinema-share-badge span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cinema-for-you-metric-stack{position:absolute;top:60px;right:0;display:grid;justify-items:end;gap:7px}.cinema-for-you-metric-stack .cinema-card-badge{min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:7px 10px;border:1px solid #d4af37;border-radius:999px;background:rgba(22,11,32,.62);color:#f7e8ff}.cinema-for-you-metric-stack .cinema-card-badge span{display:none}.cinema-for-you-metric-stack .cinema-card-badge strong{color:#d4af37;font-size:16px;font-weight:800}
.cinema-for-you-title{position:absolute;z-index:3;right:14px;bottom:142px;left:14px;display:grid;gap:4px;color:#fff}.cinema-for-you-title strong{font-size:clamp(26px,7.5vw,36px);line-height:1.02;letter-spacing:-.035em}.cinema-for-you-title span{color:#ead7ee;font-size:12px;font-weight:800;line-height:1.3}
.cinema-for-you-bottom-panel{position:absolute;z-index:4;right:14px;bottom:14px;left:14px;display:grid;grid-template-columns:76px minmax(0,1fr);gap:0}.cinema-for-you-meta{position:relative;min-width:0;min-height:58px;display:flex;align-items:center;justify-content:center;gap:0;padding:21px 4px 4px;border:0;border-right:1px solid rgba(255,255,255,.11);background:transparent;color:#fff;text-align:center;font:inherit}.cinema-for-you-meta:nth-child(2){border-right:0}.cinema-for-you-meta svg{position:absolute;top:4px;left:50%;width:18px;height:18px;transform:translateX(-50%);color:#d4af37}.cinema-for-you-meta span{min-width:0;display:block}.cinema-for-you-meta small{display:none}.cinema-for-you-meta strong{display:block;overflow:hidden;color:#fff;font-size:12px;line-height:1.08;text-align:center;text-overflow:ellipsis}
.cinema-for-you-actions{grid-column:1/-1;display:grid;grid-template-columns:1fr 1.2fr;gap:8px;margin-top:6px}.cinema-for-you-actions button{min-height:48px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid #d4af37;border-radius:13px;background:rgba(22,11,32,.35);color:#fff;font:inherit;font-size:12px;font-weight:900}.cinema-for-you-actions .primary{border-width:2px;color:#f2d56d}
.cinema-sheet-backdrop{position:fixed;z-index:4000;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:16px;background:rgba(0,0,0,.73)}.cinema-calendar-popover{position:relative;width:min(560px,100%);display:grid;gap:10px;padding:20px;border:2px solid #d4af37;border-radius:28px 28px 18px 18px;background:linear-gradient(180deg,#2a1534,#120917);color:#fff;box-shadow:0 25px 70px rgba(0,0,0,.8)}
.cinema-sheet-close{position:absolute;z-index:2;top:14px;right:14px;width:42px;height:42px;display:grid;place-items:center;border:1px solid #d4af37;border-radius:999px;background:#1f1028;color:#d4af37}.cinema-calendar-toolbar{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:8px;padding-right:44px}.cinema-calendar-toolbar button{width:44px;height:44px;display:grid;place-items:center;border:1px solid #70587a;border-radius:12px;background:#1b0f22;color:#d4af37}.cinema-calendar-toolbar strong{text-align:center;color:#fff;font-weight:850;text-transform:capitalize}
.cinema-calendar-weekdays,.cinema-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.cinema-calendar-weekdays span{color:#baa9bf;font-size:11px;font-weight:800;text-align:center;text-transform:uppercase}.cinema-calendar-grid>span,.cinema-calendar-grid button{min-height:46px;border-radius:12px}.cinema-calendar-grid button{display:grid;place-items:center;padding:3px;border:1px solid #5f426a;background:#25152f;color:#fff;font:inherit;font-weight:850}.cinema-calendar-grid button small{color:#d4af37;font-size:10px}.cinema-calendar-grid button.is-selected{border-color:#d4af37;background:#d4af37;color:#211126}.cinema-calendar-grid button.is-selected small{color:#211126}.cinema-calendar-grid button:disabled{opacity:.35}
.cinema-calendar-popover .cinema-catalog-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.cinema-calendar-popover .cinema-catalog-date{min-height:48px;display:flex;align-items:center;justify-content:center;padding:0 14px;border:1px solid #70587a;border-radius:12px;background:#25152f;color:#fff;font:inherit}.cinema-calendar-popover .cinema-details-venue{display:grid;gap:12px;padding:14px;border:1px solid #5f426a;border-radius:16px;background:#1b0f22}.cinema-calendar-popover .cinema-details-venue-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.cinema-calendar-popover .cinema-details-times{display:flex;flex-wrap:wrap;gap:8px}.cinema-calendar-popover .cinema-details-times a{min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border:2px solid #d4af37;border-radius:12px;color:#f2d56d;text-decoration:none;font-weight:900}
`;

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

function CinemaForYouScheduleSheet({
  group,
  language,
  selectedDate,
  onClose,
}: {
  group: CinemaPosterMovieGroup;
  language: Language;
  selectedDate: string;
  onClose: () => void;
}) {
  const t = copy[language];
  const screenings = rowsForDate(group, selectedDate);
  const [selectedScreeningId, setSelectedScreeningId] = useState<string | null>(null);
  const selectedScreening = screenings.find((screening) => screening.screening_id === selectedScreeningId) || null;
  const ticketHref = selectedScreening ? cinemaScreeningActionUrl({ ...selectedScreening, source_url: null }) : null;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="cinema-sheet-backdrop" onPointerDown={onClose}>
      <section className="cinema-calendar-popover" role="dialog" aria-modal="true" aria-label={`${t.schedule} · ${formatDate(selectedDate, language, true)}`} onPointerDown={(event: ReactPointerEvent<HTMLElement>) => event.stopPropagation()}>
        <button className="cinema-sheet-close" type="button" aria-label={t.close} onClick={onClose}><X /></button>
        {selectedScreening ? <>
          <div className="cinema-calendar-toolbar">
            <button type="button" aria-label={t.schedule} onClick={() => setSelectedScreeningId(null)}><ChevronLeft /></button>
            <strong>{selectedScreening.local_time}</strong>
            <span />
          </div>
          <section className="cinema-details-venue">
            <div className="cinema-details-venue-heading"><div><strong>{selectedScreening.cinema_name}</strong></div></div>
            {ticketHref ? <div className="cinema-details-times"><a href={ticketHref} target="_blank" rel="noopener noreferrer"><strong>{t.tickets}</strong></a></div> : null}
          </section>
        </> : <>
          <div className="cinema-calendar-toolbar"><span /><strong>{formatDate(selectedDate, language, true)}</strong><span /></div>
          <div className="cinema-catalog-grid">
            {screenings.map((screening) => <button className="cinema-catalog-date" key={screening.screening_id} type="button" onClick={() => setSelectedScreeningId(screening.screening_id)}><strong>{screening.local_time}</strong></button>)}
          </div>
        </>}
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
  const [selectedDate, setSelectedDate] = useState(plannedDate && dates.includes(plannedDate) ? plannedDate : (dates[0] || ""));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const weekRows = rowsForSelectedWeek(group, selectedDate || dates[0] || "");
  const row = weekRows[0] || group.rows[0];
  const t = copy[language];
  const planned = plannedDate === selectedDate;
  const genres = cinemaStringList(row.genres).slice(0, 2);
  const duration = formatDurationLabel(row.duration_minutes, language);
  const audioLanguages = audioLanguageLabel(weekRows);
  const subtitleLanguages = subtitleLanguageLabel(weekRows);
  const screeningPeriod = screeningPeriodLabel(weekRows, language);
  const languageSummary = [audioLanguages, subtitleLanguages].filter(Boolean).join(" · ");
  const togglePlan = () => onTogglePlan(group.movieId, selectedDate, planned);

  return <>
    <article className="cinema-for-you-card">
      <div className="cinema-for-you-artwork" aria-hidden="true">{row.poster_url ? <img src={row.poster_url} alt="" loading="lazy" decoding="async" /> : <Film />}</div>
      <div className="cinema-for-you-scrim" />
      <div className="cinema-for-you-top-badges">
        <button type="button" className="cinema-card-badge cinema-share-badge" onClick={() => void shareMovie(group, selectedDate, language)}><Share2 /><span>{t.share}</span></button>
        <div className="cinema-for-you-metric-stack">
          {row.imdb_rating ? <div className="cinema-card-badge"><Star /><span>{t.rating}</span><strong>{ratingLabel(row)}</strong></div> : null}
          {duration ? <div className="cinema-card-badge"><Clock3 /><span>{t.duration}</span><strong>{duration}</strong></div> : null}
        </div>
      </div>
      <div className="cinema-for-you-title">
        <strong>{row.movie_title}</strong>
        {genres.length ? <span>{genres.join(" · ")}</span> : null}
      </div>
      <div className="cinema-for-you-bottom-panel">
        <button className="cinema-for-you-meta" type="button" onClick={() => setCalendarOpen(true)}>
          <CalendarDays /><span><small>{t.date}</small><strong>{screeningPeriod || formatDate(selectedDate, language)}</strong></span>
        </button>
        <div className="cinema-for-you-meta"><Languages /><span><small>{t.language}</small><strong>{languageSummary || "—"}</strong></span></div>
        <div className="cinema-for-you-actions">
          <button className="secondary" type="button" onClick={() => setDetailsOpen(true)}><Info />{t.details}</button>
          <button className={planned ? "primary is-planned" : "primary"} type="button" onClick={togglePlan} disabled={planPending} aria-busy={planPending}>{planned ? <Check /> : <CalendarCheck />}{planned ? t.planned : t.wantToGo}</button>
        </div>
      </div>
    </article>
    {calendarOpen ? <CinemaDateCalendar group={group} language={language} selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setScheduleOpen(true); }} onClose={() => setCalendarOpen(false)} /> : null}
    {scheduleOpen ? <CinemaForYouScheduleSheet group={group} language={language} selectedDate={selectedDate} onClose={() => setScheduleOpen(false)} /> : null}
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
    <article className={plannedSurface ? "cinema-for-you-card cinema-catalog-beauty-card is-planned" : "cinema-for-you-card cinema-catalog-beauty-card"}>
      <div className="cinema-for-you-artwork" aria-hidden="true">{row.poster_url ? <img src={row.poster_url} alt="" loading="lazy" decoding="async" /> : <Film />}</div>
      <div className="cinema-for-you-scrim" />
      <div className="cinema-for-you-top-badges">
        <button type="button" className="cinema-card-badge cinema-share-badge" onClick={() => void shareMovie(group, selectedDate, language)}><Share2 /><span>{t.share}</span></button>
        <div className="cinema-for-you-metric-stack">
          {row.imdb_rating ? <div className="cinema-card-badge"><Star /><span>{t.rating}</span><strong>{ratingLabel(row)}</strong></div> : null}
          {row.duration_minutes ? <div className="cinema-card-badge"><Clock3 /><span>{t.duration}</span><strong>{formatDurationLabel(row.duration_minutes, language)}</strong></div> : null}
          <div className="cinema-card-badge"><Languages /><span>{t.language}</span><strong>{languageLabelForDate(group, selectedDate)}</strong></div>
        </div>
      </div>
      <div className="cinema-for-you-title">
        <strong>{row.movie_title}</strong>
        {genres.length ? <span>{genres.join(" · ")}</span> : null}
      </div>
      <div className="cinema-for-you-bottom-panel">
        <button className="cinema-for-you-meta" type="button" onClick={() => setCalendarOpen(true)}><CalendarDays /><span><small>{t.date}</small><strong>{formatDate(selectedDate, language)}</strong></span></button>
        <div className="cinema-for-you-meta"><MapPin /><span><small>{t.cinemas}</small><strong>{venues.join(", ") || "—"}</strong></span></div>
        <div className="cinema-for-you-actions">
          <button className="secondary" type="button" onClick={() => setDetailsOpen(true)}><Info />{t.details}</button>
          <button className={planned ? "primary is-planned" : "primary"} type="button" disabled={planPending} aria-busy={planPending} onClick={togglePlan}>{plannedSurface ? <X /> : planned ? <Check /> : <CalendarCheck />}{plannedSurface ? t.removePlan : planned ? t.planned : t.wantToGo}</button>
        </div>
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

  if (variant === "for-you") return <><style data-go-irl-cinema-runtime-fallback>{cinemaRuntimeFallbackCss}</style><div className="cinema-for-you-grid">{groups.map((group) => <ForYouMovieCard
    group={group}
    language={language}
    plannedDate={plannedByMovie.get(group.movieId)}
    planPending={planPendingFor(group.movieId)}
    onTogglePlan={togglePlan}
    key={group.movieId}
  />)}</div></>;

  return <><style data-go-irl-cinema-runtime-fallback>{cinemaRuntimeFallbackCss}</style><div className="cinema-catalog-grid cinema-beauty-card-grid">{groups.map((group) => <CatalogMovieCard
    group={group}
    language={language}
    plannedDate={plannedByMovie.get(group.movieId)}
    initialDate={variant === "catalog" ? catalogSelection.initialDates.get(group.movieId) : undefined}
    plannedSurface={variant === "planned"}
    planPending={planPendingFor(group.movieId)}
    onTogglePlan={togglePlan}
    key={group.movieId}
  />)}</div></>;
}
