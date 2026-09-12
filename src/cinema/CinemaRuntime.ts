import { createCityScheduleCalendar, type CityScheduleSlot } from "../cityScheduleCalendar";
import { supabase } from "../supabase";
import { useAppStore } from "../store";
import type { Language } from "../types";

type CinemaScheduleRow = {
  screening_id: string;
  movie_id: string;
  cinema_id: string;
  city_id: string;
  city_name: string;
  cinema_name: string;
  cinema_address: string | null;
  venue_timezone: string;
  movie_title: string;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  genres: unknown;
  age_rating: string | null;
  imdb_rating: number | null;
  poster_url: string | null;
  description: string | null;
  showing_from: string;
  showing_until: string;
  starts_at: string;
  ends_at: string | null;
  local_date: string;
  local_time: string;
  audio_language: string | null;
  subtitle_languages: unknown;
  version_type: string | null;
  audio_type: string | null;
  format: string | null;
  auditorium: string | null;
  screening_tags: unknown;
  ticket_url: string | null;
  source_url: string | null;
  source_id: string;
};

const labels: Record<Language, {
  title: string;
  subtitle: string;
  showing: string;
  schedule: string;
  about: string;
  empty: string;
  min: string;
}> = {
  ru: { title: "Кино", subtitle: "Фильмы и ближайшие показы", showing: "В кино", schedule: "Показы", about: "О фильме", empty: "Сейчас нет актуальных показов.", min: "мин" },
  uk: { title: "Кіно", subtitle: "Фільми та найближчі сеанси", showing: "У кіно", schedule: "Сеанси", about: "Про фільм", empty: "Зараз немає актуальних показів.", min: "хв" },
  cs: { title: "Kino", subtitle: "Filmy a nejbližší projekce", showing: "V kinech", schedule: "Program", about: "O filmu", empty: "Teď nejsou žádná aktuální promítání.", min: "min" },
  en: { title: "Cinema", subtitle: "Movies and upcoming screenings", showing: "In cinemas", schedule: "Showtimes", about: "About", empty: "There are no current screenings.", min: "min" },
};

const localeByLanguage: Record<Language, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  cs: "cs-CZ",
  en: "en-US",
};

let rows: CinemaScheduleRow[] = [];
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

const formatShowingPeriod = (from: string, until: string, language: Language) => {
  const first = formatDate(from, language);
  const last = formatDate(until, language);
  return from === until ? first : `${first} — ${last}`;
};

const ensureSurface = () => {
  let surface = document.getElementById("go-irl-cinema-surface");
  if (surface) return surface;
  const shell = document.querySelector<HTMLElement>(".app-shell");
  if (!shell) return null;
  surface = element("section", "cinema-feed-section");
  surface.id = "go-irl-cinema-surface";
  surface.dataset.kino = "Kino001";
  const anchor = shell.querySelector<HTMLElement>(".activity-section, .discover-section, main");
  if (anchor?.parentElement) anchor.parentElement.insertBefore(surface, anchor);
  else shell.append(surface);
  return surface;
};

const screeningTags = (row: CinemaScheduleRow) => {
  const tags: string[] = [];
  const format = String(row.format || "").trim();
  if (format && !/^standard$/i.test(format)) tags.push(format);
  const auditorium = String(row.auditorium || "").trim();
  if (auditorium && !/^standard$/i.test(auditorium)) tags.push(auditorium);
  const version = String(row.version_type || "").trim();
  if (version) tags.push(version);
  const audio = String(row.audio_language || "").trim();
  if (audio) tags.push(audio.toUpperCase());
  const subtitles = list(row.subtitle_languages);
  if (subtitles.length) tags.push(`${subtitles.map((item) => item.toUpperCase()).join("/")} SUB`);
  list(row.screening_tags).forEach((tag) => tags.push(tag));
  return [...new Set(tags)].slice(0, 3);
};

const scheduleSlots = (movieRows: CinemaScheduleRow[]): CityScheduleSlot[] => movieRows.map((row) => ({
  id: row.screening_id,
  date: row.local_date,
  time: row.local_time,
  venueId: row.cinema_id,
  venueName: row.cinema_name,
  venueAddress: row.cinema_address,
  actionUrl: row.ticket_url || row.source_url,
  tags: screeningTags(row),
}));

const movieGroups = () => {
  const grouped = new Map<string, CinemaScheduleRow[]>();
  rows.forEach((row) => {
    const group = grouped.get(row.movie_id) || [];
    group.push(row);
    grouped.set(row.movie_id, group);
  });
  return [...grouped.values()]
    .map((group) => group.sort((left, right) => left.starts_at.localeCompare(right.starts_at)))
    .sort((left, right) => left[0].starts_at.localeCompare(right[0].starts_at));
};

const buildMovieCard = (movieRows: CinemaScheduleRow[], language: Language) => {
  const row = movieRows[0];
  const copy = labels[language];
  const card = element("article", "cinema-movie-card");
  card.dataset.movieId = row.movie_id;

  const intro = element("div", "cinema-movie-card__intro");
  const poster = element("div", "cinema-movie-card__poster");
  if (row.poster_url) {
    const image = element("img");
    image.src = row.poster_url;
    image.alt = row.movie_title;
    image.loading = "lazy";
    image.decoding = "async";
    poster.append(image);
  } else {
    poster.append(element("span", "cinema-movie-card__poster-fallback", "🎬"));
  }

  const info = element("div", "cinema-movie-card__info");
  info.append(element("h3", "cinema-movie-card__title", row.movie_title));
  if (row.original_title && row.original_title.trim() && row.original_title.trim() !== row.movie_title.trim()) {
    info.append(element("div", "cinema-movie-card__original-title", row.original_title));
  }

  const facts = element("div", "cinema-movie-card__facts");
  if (row.duration_minutes) facts.append(element("span", "cinema-movie-card__fact", `${row.duration_minutes} ${copy.min}`));
  if (row.age_rating) facts.append(element("span", "cinema-movie-card__fact", row.age_rating));
  if (row.imdb_rating) facts.append(element("span", "cinema-movie-card__fact cinema-movie-card__rating", `IMDb ${Number(row.imdb_rating).toFixed(1)}`));
  list(row.genres).slice(0, 2).forEach((genre) => facts.append(element("span", "cinema-movie-card__fact", genre)));
  if (facts.childElementCount) info.append(facts);

  const period = element("div", "cinema-movie-card__period");
  period.append(
    element("span", "cinema-movie-card__period-label", copy.showing),
    element("strong", "cinema-movie-card__period-value", formatShowingPeriod(row.showing_from, row.showing_until, language)),
  );
  info.append(period);
  intro.append(poster, info);
  card.append(intro);

  const description = String(row.description || "").trim();
  if (description) {
    const details = element("details", "cinema-movie-card__description");
    details.append(element("summary", "", copy.about), element("p", "", description));
    card.append(details);
  }

  const schedule = element("div", "cinema-movie-card__schedule");
  const scheduleHeading = element("div", "cinema-movie-card__schedule-heading");
  scheduleHeading.append(
    element("strong", "", copy.schedule),
    element("span", "cinema-movie-card__screening-total", String(movieRows.length)),
  );
  schedule.append(scheduleHeading, createCityScheduleCalendar({
    slots: scheduleSlots(movieRows),
    language,
    maxDays: 7,
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

  const header = element("div", "cinema-feed-section__header");
  const headerCopy = element("div", "cinema-feed-section__header-copy");
  const cityName = rows[0]?.city_name;
  headerCopy.append(
    element("h2", "", cityName ? `${copy.title} · ${cityName}` : copy.title),
    element("p", "", copy.subtitle),
  );
  header.append(headerCopy, element("span", "cinema-feed-section__state", loading ? "…" : ""));
  surface.append(header);

  if (!loading && !rows.length) {
    surface.append(element("div", "cinema-feed-section__empty", copy.empty));
    return;
  }

  const track = element("div", "cinema-feed-section__track");
  movieGroups().forEach((group) => track.append(buildMovieCard(group, language)));
  surface.append(track);
};

const queueRender = () => {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(render);
};

const loadCinema = async (cityId: string) => {
  requestedCity = cityId;
  rows = [];
  loading = true;
  queueRender();
  const { data, error } = await supabase
    .from("cinema_movie_schedule_v")
    .select("*")
    .eq("city_id", cityId)
    .order("starts_at", { ascending: true })
    .limit(800);
  if (requestedCity !== cityId) return;
  rows = error ? [] : (data || []) as CinemaScheduleRow[];
  loading = false;
  queueRender();
};

const sync = () => {
  const state = useAppStore.getState();
  queueRender();
  if (!isVisibleSurface()) return;
  if (state.selectedCityId !== requestedCity) void loadCinema(state.selectedCityId);
};

const observer = new MutationObserver((mutations) => {
  const outsideCinema = mutations.some((mutation) => {
    const target = mutation.target;
    return !(target instanceof Element && target.closest("#go-irl-cinema-surface"));
  });
  if (outsideCinema && !document.getElementById("go-irl-cinema-surface")) queueRender();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

useAppStore.subscribe((state, previous) => {
  if (state.selectedCityId !== previous.selectedCityId || state.language !== previous.language || state.view !== previous.view) sync();
});

sync();
