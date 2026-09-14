import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Film, MapPin } from "lucide-react";
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
import "./cinema-posters.css";

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
  schedule: string;
  about: string;
  min: string;
  screenings: string;
}> = {
  ru: { loading: "Загружаем кино…", error: "Не удалось загрузить киноафишу.", empty: "Для этого периода сеансов пока нет.", schedule: "Сеансы", about: "О фильме", min: "мин", screenings: "сеансов" },
  uk: { loading: "Завантажуємо кіно…", error: "Не вдалося завантажити кіноафішу.", empty: "Для цього періоду сеансів поки немає.", schedule: "Сеанси", about: "Про фільм", min: "хв", screenings: "сеансів" },
  cs: { loading: "Načítáme kino…", error: "Program kina se nepodařilo načíst.", empty: "Pro toto období zatím nejsou žádné projekce.", schedule: "Program", about: "O filmu", min: "min", screenings: "projekcí" },
  en: { loading: "Loading cinema…", error: "Cinema listings could not be loaded.", empty: "There are no screenings for this period yet.", schedule: "Showtimes", about: "About", min: "min", screenings: "shows" },
  pl: { loading: "Ładowanie kina…", error: "Nie udało się wczytać repertuaru kina.", empty: "Brak seansów w tym okresie.", schedule: "Seanse", about: "O filmie", min: "min", screenings: "seansów" },
  sk: { loading: "Načítava sa kino…", error: "Program kina sa nepodarilo načítať.", empty: "Pre toto obdobie zatiaľ nie sú žiadne premietania.", schedule: "Program", about: "O filme", min: "min", screenings: "premietaní" },
};

const formatDate = (dateKey: string, language: Language) => {
  const value = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(value.getTime()) ? dateKey : new Intl.DateTimeFormat(localeByLanguage[language], {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(value);
};

function ScreeningSchedule({ rows, language }: { rows: CityPosterCinemaRow[]; language: Language }) {
  const dates = [...new Set(rows.map((row) => row.local_date))];
  const [selectedDate, setSelectedDate] = useState(dates[0] || "");
  const currentDate = dates.includes(selectedDate) ? selectedDate : (dates[0] || "");
  const dayRows = rows.filter((row) => row.local_date === currentDate);
  const venues = new Map<string, CityPosterCinemaRow[]>();
  dayRows.forEach((row) => venues.set(row.cinema_id, [...(venues.get(row.cinema_id) || []), row]));
  const t = copy[language];

  if (!dates.length) return null;
  return (
    <div className="city-posters-cinema-schedule">
      <div className="city-posters-cinema-dates" role="tablist" aria-label={t.schedule}>
        {dates.slice(0, 7).map((date) => (
          <button
            className={currentDate === date ? "is-active" : ""}
            key={date}
            onClick={() => setSelectedDate(date)}
            role="tab"
            aria-selected={currentDate === date}
            type="button"
          >
            <span>{formatDate(date, language)}</span>
            <small>{rows.filter((row) => row.local_date === date).length}</small>
          </button>
        ))}
      </div>
      <div className="city-posters-cinema-venues">
        {[...venues.values()].map((venueRows) => {
          const venue = venueRows[0];
          return (
            <section className="city-posters-cinema-venue" key={venue.cinema_id}>
              <div className="city-posters-cinema-venue-heading">
                <div><strong>{venue.cinema_name}</strong>{venue.cinema_address ? <span><MapPin />{venue.cinema_address}</span> : null}</div>
                <small>{venueRows.length}</small>
              </div>
              <div className="city-posters-cinema-times">
                {venueRows.map((row) => {
                  const href = cinemaScreeningActionUrl(row);
                  const tags = cinemaScreeningTags(row);
                  const content = <><strong>{row.local_time}</strong>{tags.length ? <span>{tags.join(" · ")}</span> : null}</>;
                  const ariaLabel = [row.local_time, row.cinema_name, ...tags].filter(Boolean).join(" · ");
                  return href ? (
                    <a key={row.screening_id} href={href} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel}>{content}</a>
                  ) : <span className="is-static" key={row.screening_id} aria-label={ariaLabel}>{content}</span>;
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MovieCard({ group, language }: { group: CinemaPosterMovieGroup; language: Language }) {
  const row = group.rows[0];
  const t = copy[language];
  const genres = cinemaStringList(row.genres).slice(0, 2);
  return (
    <article className="city-posters-cinema-card">
      <div className="city-posters-cinema-card-intro">
        <div className="city-posters-cinema-poster">
          {row.poster_url ? <img src={row.poster_url} alt={row.movie_title} loading="lazy" decoding="async" /> : <Film aria-hidden="true" />}
        </div>
        <div className="city-posters-cinema-info">
          <h2>{row.movie_title}</h2>
          {row.original_title && row.original_title !== row.movie_title ? <p className="city-posters-cinema-original">{row.original_title}</p> : null}
          <div className="city-posters-cinema-facts">
            {row.release_year ? <span>{row.release_year}</span> : null}
            {row.duration_minutes ? <span>{row.duration_minutes} {t.min}</span> : null}
            {row.age_rating ? <span>{row.age_rating}</span> : null}
            {row.imdb_rating ? <span>IMDb {Number(row.imdb_rating).toFixed(1)}</span> : null}
            {genres.map((genre) => <span key={genre}>{genre}</span>)}
          </div>
          <div className="city-posters-cinema-screening-count">{group.rows.length} {t.screenings}</div>
        </div>
      </div>
      {row.description ? <details className="city-posters-cinema-description"><summary>{t.about}</summary><p>{row.description}</p></details> : null}
      <ScreeningSchedule rows={group.rows} language={language} />
    </article>
  );
}

export function CinemaPostersCatalog({
  cityId,
  language,
  timeFilter,
  query = "",
}: {
  cityId: string;
  language: Language;
  timeFilter: CinemaPosterTimeFilter;
  query?: string;
}) {
  const t = copy[language];
  const cinemaQuery = useQuery({
    queryKey: ["city-posters", "cinema", cityId],
    queryFn: () => loadCityPostersCinema(cityId),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const groups = useMemo(() => groupCinemaPosterMovies(selectCinemaPosterRows(cinemaQuery.data || [], {
    timeFilter,
    query,
  })), [cinemaQuery.data, timeFilter, query]);

  if (cinemaQuery.isPending) return <div className="city-posters-cinema-state"><span className="city-posters-cinema-loader" />{t.loading}</div>;
  if (cinemaQuery.isError) return <div className="city-posters-cinema-state is-error"><Film />{t.error}</div>;
  if (!groups.length) return <div className="city-posters-cinema-state"><Film />{t.empty}</div>;

  return <div className="city-posters-cinema-grid">{groups.map((group) => <MovieCard group={group} language={language} key={group.movieId} />)}</div>;
}
