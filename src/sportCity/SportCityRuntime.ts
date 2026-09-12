import { createCityScheduleCalendar, type CityScheduleSlot } from "../cityScheduleCalendar";
import { supabase } from "../supabase";
import { useAppStore } from "../store";
import type { Language } from "../types";

type SportCityScheduleRow = {
  occurrence_id: string;
  series_id: string;
  canonical_event_id: string;
  city_id: string;
  city_name: string;
  event_title: string;
  occurrence_title: string | null;
  sport_type: string | null;
  competition: string | null;
  home_team: string | null;
  away_team: string | null;
  stage: string | null;
  description: string | null;
  image_url: string | null;
  venue_id: string;
  venue_name: string | null;
  venue_address: string | null;
  starts_at: string;
  ends_at: string | null;
  local_date: string;
  local_time: string;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  ticket_url: string | null;
  source_url: string | null;
  organizer_name: string | null;
  tags: unknown;
  source_id: string;
};

const labels: Record<Language, {
  title: string;
  subtitle: string;
  dates: string;
  schedule: string;
  about: string;
  empty: string;
  events: string;
}> = {
  ru: { title: "Спорт в городе", subtitle: "Матчи, турниры и спортивные события", dates: "Даты", schedule: "Расписание", about: "О событии", empty: "Сейчас нет опубликованных городских спорт-событий.", events: "событий" },
  uk: { title: "Спорт у місті", subtitle: "Матчі, турніри та спортивні події", dates: "Дати", schedule: "Розклад", about: "Про подію", empty: "Зараз немає опублікованих міських спортивних подій.", events: "подій" },
  cs: { title: "Sport ve městě", subtitle: "Zápasy, turnaje a sportovní akce", dates: "Termíny", schedule: "Program", about: "O akci", empty: "Teď nejsou žádné publikované městské sportovní akce.", events: "akcí" },
  en: { title: "City sport", subtitle: "Matches, tournaments and sporting events", dates: "Dates", schedule: "Schedule", about: "About", empty: "There are no published city sport events right now.", events: "events" },
};

const localeByLanguage: Record<Language, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  cs: "cs-CZ",
  en: "en-US",
};

let rows: SportCityScheduleRow[] = [];
let loading = false;
let requestedCity = "";
let renderQueued = false;

const list = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
  : [];

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const currentLanguage = (): Language => useAppStore.getState().language;

const isVisibleSurface = () => {
  const state = useAppStore.getState();
  return state.view === "home" || state.view === "discover" || state.view === "explore";
};

const formatDate = (value: string, language: Language) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(localeByLanguage[language], { day: "numeric", month: "short" }).format(date);
};

const eventPeriod = (eventRows: SportCityScheduleRow[], language: Language) => {
  const dates = [...new Set(eventRows.map((row) => row.local_date))].sort();
  if (!dates.length) return "";
  const first = formatDate(dates[0], language);
  const last = formatDate(dates[dates.length - 1], language);
  return dates.length === 1 ? first : `${first} — ${last}`;
};

const ensureSurface = () => {
  let surface = document.getElementById("go-irl-sport-city-surface");
  if (surface) return surface;
  const shell = document.querySelector<HTMLElement>(".app-shell");
  if (!shell) return null;
  surface = element("section", "sport-city-feed-section");
  surface.id = "go-irl-sport-city-surface";
  surface.dataset.sportCity = "Sport001";

  const cinemaSurface = document.getElementById("go-irl-cinema-surface");
  if (cinemaSurface?.parentElement) cinemaSurface.insertAdjacentElement("afterend", surface);
  else {
    const anchor = shell.querySelector<HTMLElement>(".activity-section, .discover-section, main");
    if (anchor?.parentElement) anchor.parentElement.insertBefore(surface, anchor);
    else shell.append(surface);
  }
  return surface;
};

const priceLabel = (row: SportCityScheduleRow) => {
  const min = Number(row.price_min);
  if (!Number.isFinite(min) || min <= 0) return null;
  const currency = String(row.currency || "").trim();
  const max = Number(row.price_max);
  if (Number.isFinite(max) && max > min) return `${Math.round(min)}–${Math.round(max)} ${currency}`.trim();
  return `${Math.round(min)} ${currency}`.trim();
};

const slotLabel = (row: SportCityScheduleRow, cardTitle: string) => {
  if (row.home_team && row.away_team) return `${row.home_team} — ${row.away_team}`;
  const title = String(row.occurrence_title || "").trim();
  return title && title !== cardTitle ? title : null;
};

const slotTags = (row: SportCityScheduleRow) => {
  const tags: string[] = [];
  if (row.stage) tags.push(row.stage);
  const price = priceLabel(row);
  if (price) tags.push(price);
  list(row.tags).filter((tag) => !/^sport(s)?$/i.test(tag)).slice(0, 2).forEach((tag) => tags.push(tag));
  return [...new Set(tags)].slice(0, 3);
};

const scheduleSlots = (eventRows: SportCityScheduleRow[], cardTitle: string): CityScheduleSlot[] => eventRows.map((row) => ({
  id: row.occurrence_id,
  date: row.local_date,
  time: row.local_time,
  venueId: row.venue_id,
  venueName: row.venue_name || row.city_name,
  venueAddress: row.venue_address,
  actionUrl: row.ticket_url || row.source_url,
  label: slotLabel(row, cardTitle),
  tags: slotTags(row),
}));

const eventGroups = () => {
  const grouped = new Map<string, SportCityScheduleRow[]>();
  rows.forEach((row) => {
    const key = row.series_id || row.canonical_event_id;
    const group = grouped.get(key) || [];
    group.push(row);
    grouped.set(key, group);
  });
  return [...grouped.values()]
    .map((group) => group.sort((left, right) => `${left.local_date}T${left.local_time}`.localeCompare(`${right.local_date}T${right.local_time}`)))
    .sort((left, right) => `${left[0].local_date}T${left[0].local_time}`.localeCompare(`${right[0].local_date}T${right[0].local_time}`));
};

const buildEventCard = (eventRows: SportCityScheduleRow[], language: Language) => {
  const row = eventRows[0];
  const copy = labels[language];
  const cardTitle = row.event_title || row.occurrence_title || copy.title;
  const card = element("article", "sport-city-card");
  card.dataset.seriesId = row.series_id;

  const hero = element("div", "sport-city-card__hero");
  if (row.image_url) {
    const image = element("img");
    image.src = row.image_url;
    image.alt = cardTitle;
    image.loading = "lazy";
    image.decoding = "async";
    hero.append(image);
  } else {
    hero.append(element("span", "sport-city-card__hero-fallback", "🏟️"));
  }

  const info = element("div", "sport-city-card__info");
  info.append(element("h3", "sport-city-card__title", cardTitle));
  if (row.competition) info.append(element("div", "sport-city-card__competition", row.competition));

  const facts = element("div", "sport-city-card__facts");
  [row.sport_type, row.organizer_name].filter((value): value is string => Boolean(value?.trim())).forEach((value) => {
    facts.append(element("span", "sport-city-card__fact", value));
  });
  const price = priceLabel(row);
  if (price) facts.append(element("span", "sport-city-card__fact sport-city-card__price", price));
  if (facts.childElementCount) info.append(facts);

  const period = element("div", "sport-city-card__period");
  period.append(
    element("span", "sport-city-card__period-label", copy.dates),
    element("strong", "sport-city-card__period-value", eventPeriod(eventRows, language)),
  );
  info.append(period);

  const intro = element("div", "sport-city-card__intro");
  intro.append(hero, info);
  card.append(intro);

  const description = String(row.description || "").trim();
  if (description) {
    const details = element("details", "sport-city-card__description");
    details.append(element("summary", "", copy.about), element("p", "", description));
    card.append(details);
  }

  const schedule = element("div", "sport-city-card__schedule");
  const heading = element("div", "sport-city-card__schedule-heading");
  heading.append(element("strong", "", copy.schedule), element("span", "sport-city-card__event-total", String(eventRows.length)));
  schedule.append(heading, createCityScheduleCalendar({
    slots: scheduleSlots(eventRows, cardTitle),
    language,
    maxDays: 7,
    slotCountLabel: copy.events,
  }));
  card.append(schedule);
  return card;
};

const render = () => {
  renderQueued = false;
  const surface = ensureSurface();
  if (!surface) return;
  if (!isVisibleSurface()) {
    surface.hidden = true;
    return;
  }

  surface.hidden = false;
  const language = currentLanguage();
  const copy = labels[language];
  surface.replaceChildren();

  const header = element("div", "sport-city-feed-section__header");
  const headerCopy = element("div", "sport-city-feed-section__header-copy");
  const cityName = rows[0]?.city_name;
  headerCopy.append(
    element("h2", "", cityName ? `${copy.title} · ${cityName}` : copy.title),
    element("p", "", copy.subtitle),
  );
  header.append(headerCopy, element("span", "sport-city-feed-section__state", loading ? "…" : ""));
  surface.append(header);

  if (!loading && !rows.length) {
    surface.append(element("div", "sport-city-feed-section__empty", copy.empty));
    return;
  }

  const track = element("div", "sport-city-feed-section__track");
  eventGroups().forEach((group) => track.append(buildEventCard(group, language)));
  surface.append(track);
};

const queueRender = () => {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(render);
};

const loadSportCity = async (cityId: string) => {
  requestedCity = cityId;
  rows = [];
  loading = true;
  queueRender();
  const { data, error } = await supabase
    .from("sport_city_schedule_v")
    .select("*")
    .eq("city_id", cityId)
    .order("local_date", { ascending: true })
    .order("local_time", { ascending: true })
    .limit(500);
  if (requestedCity !== cityId) return;
  rows = error ? [] : (data || []) as SportCityScheduleRow[];
  loading = false;
  queueRender();
};

const sync = () => {
  const state = useAppStore.getState();
  queueRender();
  if (!isVisibleSurface()) return;
  if (state.selectedCityId !== requestedCity) void loadSportCity(state.selectedCityId);
};

const observer = new MutationObserver((mutations) => {
  const outsideSurface = mutations.some((mutation) => {
    const target = mutation.target;
    return !(target instanceof Element && target.closest("#go-irl-sport-city-surface"));
  });
  if (outsideSurface && !document.getElementById("go-irl-sport-city-surface")) queueRender();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

useAppStore.subscribe((state, previous) => {
  if (state.selectedCityId !== previous.selectedCityId || state.language !== previous.language || state.view !== previous.view) sync();
});

sync();
