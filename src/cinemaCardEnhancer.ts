import { useAppStore } from "./store";
import type { Activity, Language } from "./types";

type CinemaMetadata = {
  movieTitle?: string;
  posterUrl?: string;
  cinemaName?: string;
  format?: string;
  auditorium?: string;
  audioType?: string;
  versionType?: string;
  audioLanguage?: string;
  subtitleLanguages?: string[];
  durationMinutes?: number;
  ageRating?: string;
  ticketUrl?: string;
  screeningId?: string;
  movieId?: string;
  sourceId?: string;
  autoposted?: boolean;
};

const aliases = ["кино", "кіно", "kino", "cinema", "movie", "🎬"];

const copy: Record<Language, { cinema: string; tickets: string; original: string; subtitles: string; dubbing: string }> = {
  ru: { cinema: "КИНО", tickets: "Билеты", original: "Оригинал", subtitles: "С субтитрами", dubbing: "Дубляж" },
  uk: { cinema: "КІНО", tickets: "Квитки", original: "Оригінал", subtitles: "Із субтитрами", dubbing: "Дубляж" },
  cs: { cinema: "KINO", tickets: "Vstupenky", original: "Originál", subtitles: "S titulky", dubbing: "Dabing" },
  en: { cinema: "CINEMA", tickets: "Tickets", original: "Original", subtitles: "Subtitles", dubbing: "Dubbed" },
};

const normalize = (value: string | null | undefined) => String(value || "")
  .toLocaleLowerCase()
  .replace(/[\u200d\ufe0f]/g, "")
  .replace(/^\s*[\p{Extended_Pictographic}\s]+/u, "")
  .trim();

const cinemaMetadata = (activity: Activity): CinemaMetadata | null => {
  const metadata = activity.metadata as (Activity["metadata"] & { cinema?: CinemaMetadata }) | undefined;
  return metadata?.cinema || null;
};

const isCinemaActivity = (activity: Activity) => {
  if (cinemaMetadata(activity)) return true;
  const values = [activity.categoryId, ...Object.values(activity.activity || {}), ...Object.values(activity.title || {})]
    .map(normalize);
  return values.some((value) => aliases.some((alias) => value === alias || value.includes(` ${alias}`) || value.startsWith(`${alias} `)));
};

const localized = (values: Record<Language, string>, language: Language) => values[language] || values.en || Object.values(values)[0] || "";

const ensureStyles = () => {
  if (document.getElementById("go-irl-cinema-card-styles")) return;
  const style = document.createElement("style");
  style.id = "go-irl-cinema-card-styles";
  style.textContent = `
    .activity-card.cinema-event-card { overflow: hidden; }
    .cinema-event-card .glass-event-card-artwork { min-height: 238px; background: #0b0c0f; }
    .cinema-event-card .glass-event-card-artwork-image { width: 100%; height: 100%; object-fit: cover; object-position: 50% 32%; }
    .cinema-event-card.has-cinema-poster .glass-event-card-artwork::after {
      content: ""; position: absolute; inset: auto 0 0; height: 48%; pointer-events: none;
      background: linear-gradient(180deg, transparent, rgba(8,9,11,.88));
    }
    .cinema-card-badges { position: absolute; z-index: 4; top: 14px; left: 14px; display: flex; flex-wrap: wrap; gap: 6px; max-width: calc(100% - 90px); }
    .cinema-card-badge { display: inline-flex; align-items: center; min-height: 28px; padding: 5px 9px; border-radius: 999px; background: rgba(13,15,18,.78); border: 1px solid rgba(255,255,255,.16); color: #fff; backdrop-filter: blur(10px); font-size: 11px; font-weight: 900; letter-spacing: .04em; line-height: 1; }
    .cinema-card-badge.is-primary { background: rgba(201,255,61,.94); border-color: rgba(201,255,61,.94); color: #10120d; }
    .cinema-event-card .sport-card-main { padding-bottom: 8px; }
    .cinema-event-card .sport-card-main h3 { font-size: clamp(20px, 5.6vw, 27px); line-height: 1.05; letter-spacing: -.03em; }
    .cinema-event-card .sport-card-main p { margin-top: 5px; font-weight: 700; color: var(--muted); }
    .cinema-card-facts { display: flex; gap: 7px; overflow-x: auto; padding: 0 16px 10px; scrollbar-width: none; }
    .cinema-card-facts::-webkit-scrollbar { display: none; }
    .cinema-card-fact { flex: 0 0 auto; padding: 7px 10px; border-radius: 10px; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.075); color: var(--text); font-size: 12px; font-weight: 750; white-space: nowrap; }
    .cinema-card-ticket { min-height: 38px; border: 1px solid rgba(201,255,61,.32); border-radius: 10px; background: rgba(201,255,61,.08); color: #dfff83; font-weight: 850; cursor: pointer; }
    .cinema-card-ticket:hover { background: rgba(201,255,61,.14); }
    .cinema-event-card .cinema-hidden-price { display: none !important; }
    @media (max-width: 520px) {
      .cinema-event-card .glass-event-card-artwork { min-height: 216px; }
      .cinema-card-badges { top: 12px; left: 12px; }
    }
  `;
  document.head.append(style);
};

const cardActivity = (card: HTMLElement, activities: Activity[], language: Language, claimed: Set<string>) => {
  const persistedId = card.dataset.cinemaActivityId;
  if (persistedId) return activities.find((activity) => activity.id === persistedId) || null;

  const heading = normalize(card.querySelector(".sport-card-main h3")?.textContent);
  const subtitle = normalize(card.querySelector(".sport-card-main p")?.textContent);
  const text = normalize(card.textContent);
  const candidates = activities.filter((activity) => {
    if (claimed.has(activity.id) || !isCinemaActivity(activity)) return false;
    const activityLabel = normalize(localized(activity.activity, language));
    const title = normalize(localized(activity.title, language));
    if (heading && heading !== activityLabel && heading !== title) return false;
    if (subtitle && title && subtitle !== title && !subtitle.includes(title)) return false;
    const time = String(activity.time || "").slice(0, 5);
    return !time || text.includes(time);
  });
  return candidates[0] || null;
};

const versionLabel = (meta: CinemaMetadata, language: Language) => {
  const value = normalize(meta.versionType);
  if (!value) return null;
  if (value.includes("subtit")) return copy[language].subtitles;
  if (value.includes("orig")) return copy[language].original;
  if (value === "cz" || value.includes("dub")) return copy[language].dubbing;
  return meta.versionType || null;
};

const factsFor = (meta: CinemaMetadata, language: Language) => {
  const facts: string[] = [];
  const version = versionLabel(meta, language);
  if (version) facts.push(version);
  if (meta.audioLanguage) facts.push(meta.audioLanguage.toUpperCase());
  if (meta.subtitleLanguages?.length) facts.push(`${meta.subtitleLanguages.map((item) => item.toUpperCase()).join("/")} SUB`);
  if (meta.audioType) facts.push(meta.audioType);
  if (meta.durationMinutes) facts.push(`${meta.durationMinutes} min`);
  if (meta.ageRating) facts.push(meta.ageRating);
  return [...new Set(facts)].slice(0, 5);
};

const enhanceCard = (card: HTMLElement, activity: Activity, language: Language) => {
  if (card.dataset.cinemaEnhanced === "true" && card.dataset.cinemaActivityId === activity.id) return;
  const meta = cinemaMetadata(activity) || {};
  card.dataset.cinemaEnhanced = "true";
  card.dataset.cinemaActivityId = activity.id;
  card.classList.add("cinema-event-card");

  const artwork = card.querySelector<HTMLElement>(".glass-event-card-artwork");
  const artworkImage = artwork?.querySelector<HTMLImageElement>(".glass-event-card-artwork-image");
  if (artwork && meta.posterUrl && artworkImage) {
    artworkImage.src = meta.posterUrl;
    artworkImage.removeAttribute("srcset");
    card.classList.add("has-cinema-poster");
  }

  card.querySelector(".cinema-card-badges")?.remove();
  if (artwork) {
    const badges = document.createElement("div");
    badges.className = "cinema-card-badges";
    const values = [copy[language].cinema, meta.format, meta.auditorium].filter((value): value is string => Boolean(value));
    values.forEach((value, index) => {
      const badge = document.createElement("span");
      badge.className = `cinema-card-badge${index === 0 ? " is-primary" : ""}`;
      badge.textContent = value;
      badges.append(badge);
    });
    artwork.append(badges);
  }

  const movieTitle = meta.movieTitle || localized(activity.title, language);
  const heading = card.querySelector<HTMLElement>(".sport-card-main h3");
  const subtitle = card.querySelector<HTMLElement>(".sport-card-main p");
  if (heading) heading.textContent = movieTitle;
  if (subtitle) {
    const cinema = meta.cinemaName || activity.address;
    const time = String(activity.time || "").slice(0, 5);
    subtitle.textContent = [cinema, time].filter(Boolean).join(" · ");
  }

  card.querySelector(".cinema-card-facts")?.remove();
  const chipRow = card.querySelector(".sport-chip-row");
  const facts = factsFor(meta, language);
  if (chipRow && facts.length) {
    const row = document.createElement("div");
    row.className = "cinema-card-facts";
    facts.forEach((value) => {
      const fact = document.createElement("span");
      fact.className = "cinema-card-fact";
      fact.textContent = value;
      row.append(fact);
    });
    chipRow.insertAdjacentElement("beforebegin", row);
  }

  const details = card.querySelector<HTMLElement>(".activity-card-details");
  if (details) {
    const detailItems = Array.from(details.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
    const priceItem = detailItems[1];
    if (priceItem && activity.price <= 0 && meta.ticketUrl) priceItem.classList.add("cinema-hidden-price");
    details.querySelector(".cinema-card-ticket")?.remove();
    if (meta.ticketUrl) {
      const ticket = document.createElement("button");
      ticket.type = "button";
      ticket.className = "cinema-card-ticket";
      ticket.textContent = `${copy[language].tickets} ↗`;
      ticket.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(meta.ticketUrl, "_blank", "noopener,noreferrer");
      });
      details.append(ticket);
    }
  }
};

export const enhanceCinemaCards = () => {
  ensureStyles();
  const state = useAppStore.getState();
  const language = state.language as Language;
  const activities = state.activities.filter(isCinemaActivity);
  if (!activities.length) return;
  const claimed = new Set<string>();
  document.querySelectorAll<HTMLElement>(".activity-card.unified-event-card").forEach((card) => {
    const activity = cardActivity(card, activities, language, claimed);
    if (!activity) return;
    claimed.add(activity.id);
    enhanceCard(card, activity, language);
  });
};
