import { useEffect, type CSSProperties } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, MapPin, Ticket } from "lucide-react";
import { getCity } from "../../config/cities";
import { EventCardMetaItem, EventDetailsAction } from "../../components/EventCardPrimitives";
import type { Language } from "../../types";
import { planCityPostersEventBySlug } from "../cityPostersPlanned";
import {
  loadCityPostersEventBySlug,
  loadCityPostersEvents,
  type CityPostersEventCategory,
  type CityPostersEventRow,
  type CityPostersEventTimeFilter,
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
  timeFilter = "upcoming",
  query = "",
  eventSlug,
  variant = "catalog",
  onResolvedCity,
}: {
  cityId: string;
  category?: CityPostersEventCategory;
  language: Language;
  timeFilter?: CityPostersEventTimeFilter;
  query?: string;
  eventSlug?: string | null;
  variant?: "catalog" | "for-you";
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

  const cardVariant = eventSlug ? "detail" : variant;

  const listClassName = category === "festivals" && !eventSlug
    ? cardVariant === "for-you"
      ? "horizontal-events city-posters-event-list city-posters-event-list--for-you"
      : "activity-stack city-posters-event-list city-posters-event-list--catalog"
    : `city-posters-event-list city-posters-event-list--${cardVariant}`;

  return <div className={listClassName}>
    {rows.map((row) => {
      const rowCityId = row.city_id || cityId;
      const detailsHref = `/city-posters?event=${encodeURIComponent(row.canonical_slug)}`;
      const planned = plan.isSuccess && plan.variables === row.canonical_slug;
      const locationLabel = [row.venue_address, getCity(rowCityId).name[language]].filter(Boolean).join(", ");
      const festivalCard = category === "festivals" && !eventSlug;
      if (festivalCard) {
        const festivalArtwork = cardVariant === "for-you"
          ? "/city-posters/category-backgrounds/festivals.webp"
          : (row.hero_media_url || "/city-posters/category-backgrounds/festivals.webp");
        const artworkStyle = {
          "--event-share-background": `url("${festivalArtwork}")`,
          "--event-discover-background": `url("${festivalArtwork}")`,
        } as CSSProperties;
        return <article className="activity-card sport-card compact-sport-card unified-event-card glass-event-card city-posters-festival-activity-card" key={row.occurrence_id}>
          <div className="glass-event-card-artwork" aria-hidden="true" style={artworkStyle}>
            <img className="glass-event-card-artwork-image" src={festivalArtwork} alt="" decoding="async" />
          </div>
          <button className="sport-card-main glass-event-card-main" type="button" onClick={() => { window.location.href = detailsHref; }}>
            <h3>{row.title}</h3>
            <p>{row.venue_name || getCity(rowCityId).name[language]}</p>
          </button>
          <div className="activity-card-details sport-details-grid">
            <div className="glass-event-card-meta-item organizer-avatar-action" aria-hidden="true"><span className="organizer-avatar-thumb">🎉</span></div>
            <EventCardMetaItem icon={<CalendarDays />} caption="" value={eventDateLabel(row, language)} />
            <EventCardMetaItem icon={<Ticket />} caption="" value={language === "ru" ? "Фестиваль" : "Festival"} />
            <EventCardMetaItem icon={<MapPin />} caption="" value={locationLabel} />
          </div>
          <div className="activity-card-footer compact-sport-actions">
            <EventDetailsAction label={t.details} onClick={() => { window.location.href = detailsHref; }} />
            <button className="card-join" type="button" disabled={plan.isPending} onClick={() => plan.mutate(row.canonical_slug)}>
              {planned ? t.planned : t.plan}
            </button>
          </div>
        </article>;
      }
      return <article className={`city-posters-event-card city-posters-event-card--${cardVariant}`} key={row.occurrence_id}>
        {row.hero_media_url ? <img alt="" src={row.hero_media_url} /> : null}
        <div className="city-posters-event-card-body">
          <div className="city-posters-event-badges">
            <time dateTime={row.starts_at}>{eventDateLabel(row, language)}</time>
            <span>{getCity(rowCityId).name[language]}</span>
          </div>
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
