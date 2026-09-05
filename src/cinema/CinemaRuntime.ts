import { supabase } from "../supabase";
import { useAppStore } from "../store";
import type { Language } from "../types";

type CinemaCardRow = {
  cinema_run_id: string;
  movie_id: string;
  cinema_id: string;
  city_id: string;
  city_name: string;
  cinema_name: string;
  cinema_address: string | null;
  movie_title: string;
  original_title: string | null;
  poster_url: string | null;
  duration_minutes: number | null;
  genres: unknown;
  age_rating: string | null;
  imdb_id: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  showing_from: string;
  showing_until: string;
  languages: unknown;
  versions: unknown;
  description: string | null;
  ticket_url: string | null;
  source_url: string | null;
};

const labels: Record<Language, {
  title: string;
  showing: string;
  duration: string;
  languages: string;
  details: string;
  tickets: string;
  empty: string;
}> = {
  ru: { title: "Кино", showing: "В кино", duration: "Длительность", languages: "Язык / версия", details: "Описание", tickets: "Билеты", empty: "Сейчас нет актуальных показов." },
  uk: { title: "Кіно", showing: "У кіно", duration: "Тривалість", languages: "Мова / версія", details: "Опис", tickets: "Квитки", empty: "Зараз немає актуальних показів." },
  cs: { title: "Kino", showing: "V kinech", duration: "Délka", languages: "Jazyk / verze", details: "Popis", tickets: "Vstupenky", empty: "Teď nejsou žádná aktuální promítání." },
  en: { title: "Cinema", showing: "In cinemas", duration: "Duration", languages: "Language / version", details: "Description", tickets: "Tickets", empty: "There are no current screenings." },
};

const localeByLanguage: Record<Language, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  cs: "cs-CZ",
  en: "en-US",
};

let rows: CinemaCardRow[] = [];
let loading = false;
let requestedCity = "";
let renderQueued = false;

const list = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
  : [];

const formatDate = (value: string, language: Language) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(localeByLanguage[language], { day: "numeric", month: "short" }).format(date);
};

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

const buildCard = (row: CinemaCardRow, language: Language) => {
  const copy = labels[language];
  const card = element("article", "cinema-card");
  card.dataset.cinemaRunId = row.cinema_run_id;

  const poster = element("div", "cinema-card__poster");
  if (row.poster_url) {
    const image = element("img");
    image.src = row.poster_url;
    image.alt = row.movie_title;
    image.loading = "lazy";
    image.decoding = "async";
    poster.append(image);
  } else {
    poster.append(element("span", "cinema-card__poster-fallback", "🎬"));
  }

  const body = element("div", "cinema-card__body");
  const heading = element("div", "cinema-card__heading");
  heading.append(element("h3", "cinema-card__title", row.movie_title));
  if (row.original_title && row.original_title !== row.movie_title) {
    heading.append(element("div", "cinema-card__original-title", row.original_title));
  }
  heading.append(element("div", "cinema-card__cinema", row.cinema_name));
  body.append(heading);

  const facts = element("div", "cinema-card__facts");
  facts.append(element("span", "cinema-card__fact", `${copy.showing}: ${formatDate(row.showing_from, language)} — ${formatDate(row.showing_until, language)}`));
  if (row.duration_minutes) facts.append(element("span", "cinema-card__fact", `${copy.duration}: ${row.duration_minutes} min`));
  if (row.imdb_rating) facts.append(element("span", "cinema-card__fact cinema-card__rating", `IMDb ${row.imdb_rating.toFixed(1)}`));
  body.append(facts);

  const languageParts = [...list(row.languages), ...list(row.versions)];
  if (languageParts.length) {
    const meta = element("div", "cinema-card__languages");
    meta.append(element("strong", "", `${copy.languages}: `));
    meta.append(document.createTextNode(languageParts.join(" · ")));
    body.append(meta);
  }

  if (row.description) {
    const details = element("details", "cinema-card__description");
    details.append(element("summary", "", copy.details));
    details.append(element("p", "", row.description));
    body.append(details);
  }

  const actions = element("div", "cinema-card__actions");
  if (row.ticket_url) {
    const ticket = element("a", "cinema-card__ticket", copy.tickets);
    ticket.href = row.ticket_url;
    ticket.target = "_blank";
    ticket.rel = "noopener noreferrer";
    actions.append(ticket);
  }
  if (row.source_url && row.source_url !== row.ticket_url) {
    const source = element("a", "cinema-card__source", row.cinema_name);
    source.href = row.source_url;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    actions.append(source);
  }
  if (actions.childElementCount) body.append(actions);

  card.append(poster, body);
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
  header.append(element("h2", "", copy.title));
  const state = element("span", "cinema-feed-section__state", loading ? "…" : "");
  header.append(state);
  surface.append(header);

  if (!loading && !rows.length) {
    surface.append(element("div", "cinema-feed-section__empty", copy.empty));
    return;
  }

  const track = element("div", "cinema-feed-section__track");
  rows.forEach((row) => track.append(buildCard(row, language)));
  surface.append(track);
};

const queueRender = () => {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(render);
};

const loadCinema = async (cityId: string) => {
  requestedCity = cityId;
  loading = true;
  queueRender();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("cinema_activity_cards_v")
    .select("*")
    .eq("city_id", cityId)
    .gte("showing_until", today)
    .order("showing_from", { ascending: true })
    .limit(20);
  if (requestedCity !== cityId) return;
  rows = error ? [] : (data || []) as CinemaCardRow[];
  loading = false;
  queueRender();
};

const sync = () => {
  const state = useAppStore.getState();
  queueRender();
  if (!isVisibleSurface()) return;
  if (state.selectedCityId !== requestedCity) void loadCinema(state.selectedCityId);
};

const observer = new MutationObserver(() => queueRender());
observer.observe(document.documentElement, { childList: true, subtree: true });
useAppStore.subscribe((state, previous) => {
  if (state.selectedCityId !== previous.selectedCityId || state.language !== previous.language || state.view !== previous.view) sync();
});

sync();
