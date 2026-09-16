import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import type { Language } from "../../types";
import type { CinemaPosterTimeFilter } from "../cinema/cinemaModel";
import "./city-posters-event-card.css";
import {
  loadCityPostersEvents,
  type CityPostersEventCategory,
  type CityPostersEventRow,
} from "./cityPostersEventRepository";

const localeByLanguage: Record<Language, string> = {
  ru: "ru-RU", uk: "uk-UA", cs: "cs-CZ", en: "en-US", pl: "pl-PL", sk: "sk-SK",
};

const fallbackArtworkByCategory: Record<CityPostersEventCategory, string> = {
  cinema: "/activities/category-backgrounds/creativity.webp",
  concerts: "/activities/category-backgrounds/party.webp",
  festivals: "/activities/category-backgrounds/social.webp",
  sport: "/activities/category-backgrounds/sport.webp",
};

const copy: Record<Language, {
  loading: string;
  error: string;
  empty: string;
  source: string;
  category: Record<CityPostersEventCategory, string>;
}> = {
  ru: { loading: "Загружаем события…", error: "Не удалось загрузить события.", empty: "Событий по этому фильтру пока нет.", source: "Источник", category: { cinema: "Кино", concerts: "Концерт", festivals: "Фестиваль", sport: "Спорт" } },
  uk: { loading: "Завантажуємо події…", error: "Не вдалося завантажити події.", empty: "Подій за цим фільтром поки немає.", source: "Джерело", category: { cinema: "Кіно", concerts: "Концерт", festivals: "Фестиваль", sport: "Спорт" } },
  cs: { loading: "Načítáme akce…", error: "Akce se nepodařilo načíst.", empty: "Pro tento filtr zatím nejsou žádné akce.", source: "Zdroj", category: { cinema: "Kino", concerts: "Koncert", festivals: "Festival", sport: "Sport" } },
  en: { loading: "Loading events…", error: "Events could not be loaded.", empty: "No events match this filter yet.", source: "Source", category: { cinema: "Cinema", concerts: "Concert", festivals: "Festival", sport: "Sport" } },
  pl: { loading: "Ładowanie wydarzeń…", error: "Nie udało się wczytać wydarzeń.", empty: "Brak wydarzeń dla tego filtra.", source: "Źródło", category: { cinema: "Kino", concerts: "Koncert", festivals: "Festiwal", sport: "Sport" } },
  sk: { loading: "Načítavajú sa podujatia…", error: "Podujatia sa nepodarilo načítať.", empty: "Pre tento filter zatiaľ nie sú podujatia.", source: "Zdroj", category: { cinema: "Kino", concerts: "Koncert", festivals: "Festival", sport: "Šport" } },
};

function eventDateLabel(row: CityPostersEventRow, language: Language) {
  const value = new Date(row.starts_at);
  if (Number.isNaN(value.getTime())) return row.starts_at;
  return new Intl.DateTimeFormat(localeByLanguage[language], {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: row.timezone || undefined,
  }).format(value);
}

export function CityPostersEventCatalog({ cityId, category, language, timeFilter, query }: {
  cityId: string;
  category: CityPostersEventCategory;
  language: Language;
  timeFilter: CinemaPosterTimeFilter;
  query: string;
}) {
  const t = copy[language];
  const result = useQuery({
    queryKey: ["city-posters-events", cityId, category, language, timeFilter, query],
    queryFn: () => loadCityPostersEvents({ cityId, category, language, timeFilter, query }),
    staleTime: 60_000,
  });

  if (result.isLoading) return <div className="empty-state city-posters-empty-state"><CalendarDays /><p>{t.loading}</p></div>;
  if (result.isError) return <div className="empty-state city-posters-empty-state"><CalendarDays /><p>{t.error}</p></div>;

  const rows = result.data || [];
  if (!rows.length) return <div className="empty-state city-posters-empty-state"><CalendarDays /><p>{t.empty}</p></div>;

  return <div className="city-posters-event-list">
    {rows.map((row) => {
      const artwork = row.hero_media_url || fallbackArtworkByCategory[row.vertical];
      return <article className="city-posters-event-card" data-category={row.vertical} key={row.occurrence_id}>
        <div className="city-posters-event-artwork" aria-hidden="true">
          <img src={artwork} alt="" decoding="async" />
        </div>
        <div className="city-posters-event-overlay" aria-hidden="true" />
        <div className="city-posters-event-card-topline">
          <span className="city-posters-event-category-badge">{t.category[row.vertical]}</span>
          <time dateTime={row.starts_at}>{eventDateLabel(row, language)}</time>
        </div>
        <div className="city-posters-event-card-body">
          <div className="city-posters-event-card-copy">
            <h2>{row.title}</h2>
            {row.description ? <p>{row.description}</p> : null}
          </div>
          <div className="city-posters-event-card-meta">
            {row.venue_name ? <div className="city-posters-event-meta"><MapPin /><span>{[row.venue_name, row.venue_address].filter(Boolean).join(" · ")}</span></div> : null}
            {row.organizer_name ? <div className="city-posters-event-organizer"><span>{row.organizer_name}</span></div> : null}
          </div>
          {row.occurrence_url ? <a className="city-posters-event-action" href={row.occurrence_url} target="_blank" rel="noopener noreferrer"><ExternalLink /><span>{t.source}</span></a> : null}
        </div>
      </article>;
    })}
  </div>;
}
