import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import type { Language } from "../../types";
import type { CinemaPosterTimeFilter } from "../cinema/cinemaModel";
import {
  loadCityPostersEvents,
  type CityPostersEventCategory,
  type CityPostersEventRow,
} from "./cityPostersEventRepository";

const localeByLanguage: Record<Language, string> = {
  ru: "ru-RU", uk: "uk-UA", cs: "cs-CZ", en: "en-US", pl: "pl-PL", sk: "sk-SK",
};

const copy: Record<Language, { loading: string; error: string; empty: string }> = {
  ru: { loading: "Загружаем события…", error: "Не удалось загрузить события.", empty: "Событий по этому фильтру пока нет." },
  uk: { loading: "Завантажуємо події…", error: "Не вдалося завантажити події.", empty: "Подій за цим фільтром поки немає." },
  cs: { loading: "Načítáme akce…", error: "Akce se nepodařilo načíst.", empty: "Pro tento filtr zatím nejsou žádné akce." },
  en: { loading: "Loading events…", error: "Events could not be loaded.", empty: "No events match this filter yet." },
  pl: { loading: "Ładowanie wydarzeń…", error: "Nie udało się wczytać wydarzeń.", empty: "Brak wydarzeń dla tego filtra." },
  sk: { loading: "Načítavajú sa podujatia…", error: "Podujatia sa nepodarilo načítať.", empty: "Pre tento filter zatiaľ nie sú podujatia." },
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
    {rows.map((row) => <article className="city-posters-event-card" key={row.occurrence_id}>
      {row.hero_media_url ? <img alt="" src={row.hero_media_url} /> : null}
      <div className="city-posters-event-card-body">
        <time dateTime={row.starts_at}>{eventDateLabel(row, language)}</time>
        <h2>{row.title}</h2>
        {row.description ? <p>{row.description}</p> : null}
        {row.venue_name ? <div className="city-posters-event-meta"><MapPin /><span>{[row.venue_name, row.venue_address].filter(Boolean).join(" · ")}</span></div> : null}
        {row.occurrence_url ? <a href={row.occurrence_url} target="_blank" rel="noopener noreferrer"><ExternalLink /><span>{row.organizer_name || row.title}</span></a> : null}
      </div>
    </article>)}
  </div>;
}
