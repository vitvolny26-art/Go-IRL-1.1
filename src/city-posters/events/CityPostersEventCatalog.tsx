import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { getCity } from "../../config/cities";
import type { Language } from "../../types";
import type { CinemaPosterTimeFilter } from "../cinema/cinemaModel";
import { planCityPostersEventBySlug } from "../cityPostersPlanned";
import {
  loadCityPostersEventBySlug,
  loadCityPostersEvents,
  type CityPostersEventCategory,
  type CityPostersEventRow,
} from "./cityPostersEventRepository";

const localeByLanguage: Record<Language, string> = {
  ru: "ru-RU", uk: "uk-UA", cs: "cs-CZ", en: "en-GB", pl: "pl-PL", sk: "sk-SK",
};

const copy: Record<Language, {
  loading: string; error: string; empty: string; details: string; source: string; plan: string; planned: string;
}> = {
  ru: { loading: "Загружаем события…", error: "Не удалось загрузить события.", empty: "Событий по этому фильтру пока нет.", details: "Подробнее", source: "Официальная программа", plan: "Хочу пойти", planned: "Запланировано" },
  uk: { loading: "Завантажуємо події…", error: "Не вдалося завантажити події.", empty: "Подій за цим фільтром поки немає.", details: "Докладніше", source: "Офіційна програма", plan: "Хочу піти", planned: "Заплановано" },
  cs: { loading: "Načítáme akce…", error: "Akce se nepodařilo načíst.", empty: "Pro tento filtr zatím nejsou žádné akce.", details: "Podrobnosti", source: "Oficiální program", plan: "Chci jít", planned: "Naplánováno" },
  en: { loading: "Loading events…", error: "Events could not be loaded.", empty: "No events match this filter yet.", details: "Details", source: "Official programme", plan: "Want to go", planned: "Planned" },
  pl: { loading: "Ładowanie wydarzeń…", error: "Nie udało się wczytać wydarzeń.", empty: "Brak wydarzeń dla tego filtra.", details: "Szczegóły", source: "Oficjalny program", plan: "Chcę iść", planned: "Zaplanowane" },
  sk: { loading: "Načítavajú sa podujatia…", error: "Podujatia sa nepodarilo načítať.", empty: "Pre tento filter zatiaľ nie sú podujatia.", details: "Podrobnosti", source: "Oficiálny program", plan: "Chcem ísť", planned: "Naplánované" },
};

function inferredAllDay(row: CityPostersEventRow) {
  if (row.all_day === true) return true;
  if (!row.ends_at) return false;
  const start = new Date(row.starts_at);
  const end = new Date(row.ends_at);
  const duration = end.getTime() - start.getTime();
  return start.getUTCMinutes() === 0 && start.getUTCSeconds() === 0
    && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0
    && duration >= 86_400_000 && duration % 86_400_000 === 0;
}

function eventDateLabel(row: CityPostersEventRow, language: Language) {
  const value = new Date(row.starts_at);
  if (Number.isNaN(value.getTime())) return row.starts_at;
  if (inferredAllDay(row)) {
    const formatter = new Intl.DateTimeFormat(localeByLanguage[language], {
      day: "numeric", month: "long", timeZone: row.timezone || undefined,
    });
    if (!row.ends_at) return formatter.format(value);
    const inclusiveEnd = new Date(new Date(row.ends_at).getTime() - 1);
    const startLabel = formatter.format(value);
    const endLabel = formatter.format(inclusiveEnd);
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  }
  return new Intl.DateTimeFormat(localeByLanguage[language], {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: row.timezone || undefined,
  }).format(value);
}

export function CityPostersEventCatalog({
  cityId,
  category = "all",
  language,
  timeFilter = "tomorrow",
  query = "",
  eventSlug,
  onResolvedCity,
}: {
  cityId: string;
  category?: CityPostersEventCategory;
  language: Language;
  timeFilter?: CinemaPosterTimeFilter;
  query?: string;
  eventSlug?: string | null;
  onResolvedCity?: (cityId: string) => void;
}) {
  const t = copy[language];
  const exact = useQuery({
    queryKey: ["city-posters-event", eventSlug, language],
    queryFn: () => loadCityPostersEventBySlug(eventSlug || "", language),
    enabled: Boolean(eventSlug),
    staleTime: 60_000,
  });
  const catalog = useQuery({
    queryKey: ["city-posters-events", cityId, category, language, timeFilter, query],
    queryFn: () => loadCityPostersEvents({ cityId, category, language, timeFilter, query }),
    enabled: !eventSlug,
    staleTime: 60_000,
  });
  const plan = useMutation({ mutationFn: (slug: string) => planCityPostersEventBySlug(cityId, slug) });

  useEffect(() => {
    const resolvedCity = exact.data?.city_id;
    if (eventSlug && resolvedCity) onResolvedCity?.(resolvedCity);
  }, [eventSlug, exact.data?.city_id, onResolvedCity]);

  const result = eventSlug ? exact : catalog;
  if (result.isLoading) return <div className="empty-state city-posters-empty-state"><CalendarDays /><p>{t.loading}</p></div>;
  if (result.isError) return <div className="empty-state city-posters-empty-state"><CalendarDays /><p>{t.error}</p></div>;

  const rows = eventSlug ? (exact.data ? [exact.data] : []) : (catalog.data || []);
  if (!rows.length) return <div className="empty-state city-posters-empty-state"><CalendarDays /><p>{t.empty}</p></div>;

  return <div className="city-posters-event-list">
    {rows.map((row) => {
      const rowCityId = row.city_id || cityId;
      const detailsHref = `/city-posters?event=${encodeURIComponent(row.canonical_slug)}`;
      const planned = plan.isSuccess && plan.variables === row.canonical_slug;
      return <article className="city-posters-event-card" key={row.occurrence_id}>
        {row.hero_media_url ? <img alt="" src={row.hero_media_url} /> : null}
        <div className="city-posters-event-card-body">
          <time dateTime={row.starts_at}>{eventDateLabel(row, language)}</time>
          <h2>{row.title}</h2>
          {row.description ? <p>{row.description}</p> : null}
          <div className="city-posters-event-meta"><MapPin /><span>{[row.venue_name, row.venue_address, getCity(rowCityId).name[language]].filter(Boolean).join(" · ")}</span></div>
          <div className="city-posters-event-actions">
            {eventSlug
              ? row.occurrence_url ? <a href={row.occurrence_url} target="_blank" rel="noopener noreferrer"><ExternalLink /><span>{t.source}</span></a> : null
              : <a href={detailsHref}><span>{t.details}</span></a>}
            <button type="button" disabled={plan.isPending} onClick={() => plan.mutate(row.canonical_slug)}>
              {planned ? t.planned : t.plan}
            </button>
          </div>
        </div>
      </article>;
    })}
  </div>;
}
