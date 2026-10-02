import { useEffect, type CSSProperties } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, MapPin, Ticket, X } from "lucide-react";
import { getCity } from "../../config/cities";
import { EventCardMetaItem, EventDetailsAction } from "../../components/EventCardPrimitives";
import { CardShareAction } from "../../components/CardShareAction";
import { resolveActivityMapNavigation } from "../../activityMapNavigation";
import { requestMapProvider } from "../../mapProviderPicker";
import { getTelegramWebApp } from "../../telegram";
import { sharePreparedTelegramCityPostersEvent } from "../../telegramPreparedShare";
import type { Language } from "../../types";
import { readUserPreferences } from "../../userPreferences";
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
  const dateFormatter = new Intl.DateTimeFormat(localeByLanguage[language], {
    day: "numeric", month: "long", timeZone: row.timezone || undefined,
  });
  if (row.ends_at) {
    const end = new Date(row.ends_at);
    if (!Number.isNaN(end.getTime())) {
      const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", {
        year: "numeric", month: "2-digit", day: "2-digit", timeZone: row.timezone || undefined,
      }).format(date);
      const rangeEnd = inferredAllDay(row) ? new Date(end.getTime() - 1) : end;
      if (dayKey(value) !== dayKey(rangeEnd)) {
        return `${dateFormatter.format(value)} – ${dateFormatter.format(rangeEnd)}`;
      }
    }
  }
  if (inferredAllDay(row)) return dateFormatter.format(value);
  return new Intl.DateTimeFormat(localeByLanguage[language], {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: row.timezone || undefined,
  }).format(value);
}

function inferFestivalVenueLabel(row: CityPostersEventRow) {
  const haystack = `${row.canonical_slug} ${row.title} ${row.description}`.toLocaleLowerCase("cs-CZ");
  if (row.city_id === "olomouc" && haystack.includes("vinn")) return "Dolní náměstí";
  return "";
}

const calendarStamp = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

function openCityPostersCalendar(row: CityPostersEventRow, detailsHref: string, locationLabel: string) {
  const start = new Date(row.starts_at);
  if (Number.isNaN(start.getTime())) return;
  const end = row.ends_at
    ? new Date(row.ends_at)
    : new Date(start.getTime() + (inferredAllDay(row) ? 24 * 60 : 90) * 60 * 1000);
  const dates = inferredAllDay(row)
    ? `${calendarStamp(start).slice(0, 8)}/${calendarStamp(end).slice(0, 8)}`
    : `${calendarStamp(start)}/${calendarStamp(end)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: row.title,
    dates,
    details: row.description || new URL(detailsHref, window.location.origin).toString(),
    location: locationLabel,
  });
  const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
  const webApp = getTelegramWebApp();
  if (webApp?.openLink) {
    webApp.openLink(url, { try_instant_view: false });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function openCityPostersMap(locationLabel: string, cityLabel: string) {
  const navigation = resolveActivityMapNavigation({ address: locationLabel, cityName: cityLabel }, readUserPreferences().mapProvider);
  if (navigation.targetUrl) {
    window.open(navigation.targetUrl, "_blank", "noopener,noreferrer");
    return;
  }
  requestMapProvider(navigation.sourceUrl);
}

export function CityPostersEventCatalog({
  cityId,
  category = "all",
  language,
  timeFilter = "upcoming",
  query = "",
  eventSlug,
  variant = "catalog",
  focusedSlug,
  onResolvedCity,
}: {
  cityId: string;
  category?: CityPostersEventCategory;
  language: Language;
  timeFilter?: CityPostersEventTimeFilter;
  query?: string;
  eventSlug?: string | null;
  variant?: "catalog" | "for-you";
  focusedSlug?: string | null;
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
  const rows = eventSlug ? (exact.data ? [exact.data] : []) : (catalog.data || []);

  useEffect(() => {
    if (!focusedSlug || eventSlug || !rows.some((row) => row.canonical_slug === focusedSlug)) return;
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-city-posters-slug="${CSS.escape(focusedSlug)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [eventSlug, focusedSlug, rows]);

  if (result.isLoading) return <div className="empty-state city-posters-empty-state"><CalendarDays /><p>{t.loading}</p></div>;
  if (result.isError) return <div className="empty-state city-posters-empty-state"><CalendarDays /><p>{t.error}</p></div>;
  if (!rows.length) return <div className="empty-state city-posters-empty-state"><CalendarDays /><p>{t.empty}</p></div>;

  const cardVariant = eventSlug ? "detail" : variant;
  const featuredCategory = category !== "cinema" && category !== "sport" && category !== "all";
  const featuredSport = category === "sport" && cardVariant === "for-you";
  const listClassName = featuredCategory && !eventSlug
    ? cardVariant === "for-you"
      ? "horizontal-events city-posters-event-list city-posters-event-list--for-you"
      : "activity-stack"
    : `city-posters-event-list city-posters-event-list--${cardVariant}`;

  return <div className={listClassName}>
    {rows.map((row) => {
      const rowCityId = row.city_id || cityId;
      const detailsHref = `/city-posters?detail=${encodeURIComponent(row.canonical_slug)}`;
      const planned = plan.isSuccess && plan.variables === row.canonical_slug;
      const cityLabel = getCity(rowCityId).name.cs;
      const descriptionLocationMatch = row.description.match(/📍\s*([^,\n]+),\s*([^\n]+)/);
      const descriptionVenueLabel = descriptionLocationMatch?.[1]?.trim();
      const inferredVenueLabel = category === "festivals" ? inferFestivalVenueLabel(row) : "";
      const venueLocationLabel = row.venue_address || row.venue_name || descriptionVenueLabel || inferredVenueLabel;
      const locationLabel = [cityLabel, venueLocationLabel].filter(Boolean).join(", ");
      const cityDisplayLabel = getCity(rowCityId).name[language];
      const cardLocationLabel = [cityDisplayLabel, venueLocationLabel].filter(Boolean).join(" · ");
      if (eventSlug) {
        const detailFallback = row.vertical === "concerts" ? "concerts" : row.vertical === "festivals" ? "festivals" : ["theatre", "comedy", "exhibitions"].includes(row.vertical) ? "cinema" : "festivals";
        const detailArtwork = row.hero_media_url || `/city-posters/category-backgrounds/${detailFallback}.webp`;
        const closeDetail = () => {
          if (window.history.length > 1) window.history.back();
          else window.location.href = "/city-posters";
        };
        return <article className="city-posters-event-detail" key={row.occurrence_id}>
          <img className="city-posters-event-detail-artwork" src={detailArtwork} alt="" />
          <div className="city-posters-event-detail-shade" aria-hidden="true" />
          <button className="city-posters-event-detail-close" type="button" aria-label={language === "ru" ? "Закрыть" : "Close"} onClick={closeDetail}><X /></button>
          <div className="city-posters-event-detail-scroll">
            <div className="city-posters-event-badges">
              <time dateTime={row.starts_at}>{eventDateLabel(row, language)}</time>
              <span>{getCity(rowCityId).name[language]}</span>
            </div>
            <h2>{row.title}</h2>
            {row.description ? <p>{row.description}</p> : null}
            <div className="city-posters-event-meta"><MapPin /><span>{[row.venue_name, row.venue_address, getCity(rowCityId).name[language]].filter(Boolean).join(" · ")}</span></div>
          </div>
          <div className="city-posters-event-detail-actions">
            {row.occurrence_url ? <a href={row.occurrence_url} target="_blank" rel="noopener noreferrer"><ExternalLink /><span>{t.source}</span></a> : null}
            <button type="button" disabled={plan.isPending} onClick={() => plan.mutate(row.canonical_slug)}>{planned ? t.planned : t.plan}</button>
          </div>
        </article>;
      }
      const featuredEventCard = featuredCategory || featuredSport;
      if (featuredEventCard) {
        const isConcert = category === "concerts";
        const fallbackArtwork = row.vertical === "concerts" ? "concerts" : row.vertical === "festivals" ? "festivals" : ["theatre", "comedy", "exhibitions"].includes(row.vertical) ? "cinema" : "festivals";
        const eventArtwork = row.hero_media_url || (category === "sport" ? "/activities/sheets-9x16/02-football.webp" : `/city-posters/category-backgrounds/${fallbackArtwork}.webp`);
        const eventCategoryLabel = category === "sport" ? (language === "ru" ? "Спорт" : "Sport") : row.vertical === "concerts" ? (language === "ru" ? "Концерт" : "Concert") : row.vertical === "festivals" ? (language === "ru" ? "Фестиваль" : "Festival") : category === "culture" ? (language === "ru" ? "Культура" : "Culture") : (language === "ru" ? "Событие" : "Event");
        const artworkStyle = {
          "--event-share-background": `url("${eventArtwork}")`,
          "--event-discover-background": `url("${eventArtwork}")`,
        } as CSSProperties;
        return <article data-city-posters-slug={row.canonical_slug} className={`activity-card sport-card compact-sport-card unified-event-card glass-event-card city-posters-festival-activity-card ${isConcert ? "city-posters-concert-activity-card" : ""} city-posters-festival-activity-card--${cardVariant === "for-you" ? "for-you" : "catalog"} ${focusedSlug === row.canonical_slug ? "city-posters-event-card--focused" : ""}`} key={row.occurrence_id}>
          <div className="glass-event-card-artwork" aria-hidden="true" style={artworkStyle}>
            <img className="glass-event-card-artwork-image" src={eventArtwork} alt="" decoding="async" />
          </div>
          <div className="sport-card-top-actions">
            <CardShareAction
              title={row.title}
              date={eventDateLabel(row, language)}
              address={locationLabel}
              url={new URL(detailsHref, window.location.origin).toString()}
              label={language === "ru" ? "Поделиться" : "Share"}
              onTelegramShare={() => sharePreparedTelegramCityPostersEvent(row.canonical_slug, language)}
            />
          </div>
          <button className="sport-card-main glass-event-card-main" type="button" onClick={() => { window.location.href = detailsHref; }}>
            <h3>{row.title}</h3>
            <p>{row.venue_name || getCity(rowCityId).name[language]}</p>
          </button>
          <div className="city-posters-festival-meta">
            <EventCardMetaItem icon={<CalendarDays />} caption="" value={eventDateLabel(row, language)} ariaLabel={language === "ru" ? "Сохранить в календарь" : "Add to calendar"} onClick={() => openCityPostersCalendar(row, detailsHref, locationLabel)} />
            <EventCardMetaItem icon={<Ticket />} caption="" value={eventCategoryLabel} />
            <EventCardMetaItem icon={<MapPin />} caption="" value={cardLocationLabel} ariaLabel={language === "ru" ? `Открыть карту: ${locationLabel}` : `Open map: ${locationLabel}`} onClick={() => openCityPostersMap(locationLabel, cityLabel)} />
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