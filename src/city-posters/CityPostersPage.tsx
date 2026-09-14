import { useEffect, useState } from "react";
import { CalendarDays, CircleUserRound, Compass, Film, Home, Music, PartyPopper, Search, Sparkles, Trophy } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { getCity } from "../config/cities";
import { getTranslation } from "../i18n";
import { expandMiniApp, readyMiniApp, showBackButton } from "../telegram";
import type { Language } from "../types";
import { useAppStore } from "../store";
import { CinemaPostersCatalog } from "./cinema/CinemaPostersCatalog";
import type { CinemaPosterTimeFilter } from "./cinema/cinemaModel";
import "../styles.css";
import "./city-posters.css";

type CityPostersView = "home" | "for-you" | "catalog" | "planned" | "profile";
type CityPostersTimeFilter = CinemaPosterTimeFilter;
type CityPostersCategory = "all" | "cinema" | "concerts" | "festivals" | "sport";

type CityPostersCopy = {
  eyebrow: string;
  homeTitle: string;
  homeDescription: string;
  forYouTitle: string;
  forYouDescription: string;
  catalogTitle: string;
  catalogDescription: string;
  plannedTitle: string;
  plannedDescription: string;
  profileTitle: string;
  profileDescription: string;
  preferencesTitle: string;
  preferencesText: string;
  emptyHome: string;
  emptyForYou: string;
  emptyCatalog: string;
  emptyPlanned: string;
  now: string;
  today: string;
  tomorrow: string;
  weekend: string;
  all: string;
  cinema: string;
  concerts: string;
  festivals: string;
  sport: string;
  searchPlaceholder: string;
  navHome: string;
  navForYou: string;
  navCatalog: string;
  navPlanned: string;
  navProfile: string;
};

const copy: Record<Language, CityPostersCopy> = {
  ru: {
    eyebrow: "События города",
    homeTitle: "Афиша",
    homeDescription: "Кино, концерты, фестивали, спорт и другие события города.",
    forYouTitle: "Для вас",
    forYouDescription: "Рекомендации Афиши по интересам, времени и городу.",
    catalogTitle: "Каталог",
    catalogDescription: "Все события Афиши с поиском и фильтрами.",
    plannedTitle: "Запланировано",
    plannedDescription: "Сохранённые события и планы появятся здесь.",
    profileTitle: "Мой профиль",
    profileDescription: "Настройки Афиши и ваши интересы к городским событиям.",
    preferencesTitle: "Моя Афиша",
    preferencesText: "Здесь будут интересы, любимые категории, места и настройки напоминаний Афиши.",
    emptyHome: "Актуальные события пока не подключены.",
    emptyForYou: "Персональные рекомендации появятся после подключения событий и интересов.",
    emptyCatalog: "Каталог событий пока не подключён.",
    emptyPlanned: "У вас пока нет запланированных событий.",
    now: "Сейчас",
    today: "Сегодня",
    tomorrow: "Завтра",
    weekend: "Выходные",
    all: "Все",
    cinema: "Кино",
    concerts: "Концерты",
    festivals: "Фестивали",
    sport: "Спорт",
    searchPlaceholder: "Искать события, места и участников",
    navHome: "Главная",
    navForYou: "Для вас",
    navCatalog: "Каталог",
    navPlanned: "Запланировано",
    navProfile: "Мой профиль",
  },
  uk: {
    eyebrow: "Події міста",
    homeTitle: "Афіша",
    homeDescription: "Кіно, концерти, фестивалі, спорт та інші події міста.",
    forYouTitle: "Для вас",
    forYouDescription: "Рекомендації Афіші за інтересами, часом і містом.",
    catalogTitle: "Каталог",
    catalogDescription: "Усі події Афіші з пошуком і фільтрами.",
    plannedTitle: "Заплановано",
    plannedDescription: "Збережені події та плани з'являться тут.",
    profileTitle: "Мій профіль",
    profileDescription: "Налаштування Афіші та ваші інтереси до міських подій.",
    preferencesTitle: "Моя Афіша",
    preferencesText: "Тут будуть інтереси, улюблені категорії, місця та налаштування нагадувань Афіші.",
    emptyHome: "Актуальні події поки не підключені.",
    emptyForYou: "Персональні рекомендації з'являться після підключення подій та інтересів.",
    emptyCatalog: "Каталог подій поки не підключений.",
    emptyPlanned: "У вас поки немає запланованих подій.",
    now: "Зараз",
    today: "Сьогодні",
    tomorrow: "Завтра",
    weekend: "Вихідні",
    all: "Усі",
    cinema: "Кіно",
    concerts: "Концерти",
    festivals: "Фестивалі",
    sport: "Спорт",
    searchPlaceholder: "Шукати події, місця та учасників",
    navHome: "Головна",
    navForYou: "Для вас",
    navCatalog: "Каталог",
    navPlanned: "Заплановано",
    navProfile: "Мій профіль",
  },
  cs: {
    eyebrow: "Městské akce",
    homeTitle: "Program města",
    homeDescription: "Kino, koncerty, festivaly, sport a další městské akce.",
    forYouTitle: "Pro vás",
    forYouDescription: "Doporučení podle zájmů, času a města.",
    catalogTitle: "Katalog",
    catalogDescription: "Všechny městské akce s vyhledáváním a filtry.",
    plannedTitle: "Naplánováno",
    plannedDescription: "Uložené akce a plány se zobrazí zde.",
    profileTitle: "Můj profil",
    profileDescription: "Nastavení městského programu a vaše zájmy.",
    preferencesTitle: "Můj program",
    preferencesText: "Zde budou zájmy, oblíbené kategorie, místa a nastavení připomínek.",
    emptyHome: "Aktuální akce zatím nejsou připojené.",
    emptyForYou: "Osobní doporučení se zobrazí po připojení akcí a zájmů.",
    emptyCatalog: "Katalog akcí zatím není připojený.",
    emptyPlanned: "Zatím nemáte žádné naplánované akce.",
    now: "Teď",
    today: "Dnes",
    tomorrow: "Zítra",
    weekend: "Víkend",
    all: "Vše",
    cinema: "Kino",
    concerts: "Koncerty",
    festivals: "Festivaly",
    sport: "Sport",
    searchPlaceholder: "Hledat akce, místa a účastníky",
    navHome: "Domů",
    navForYou: "Pro vás",
    navCatalog: "Katalog",
    navPlanned: "Naplánováno",
    navProfile: "Můj profil",
  },
  en: {
    eyebrow: "City events",
    homeTitle: "City Posters",
    homeDescription: "Cinema, concerts, festivals, sport and other city events.",
    forYouTitle: "For you",
    forYouDescription: "City Posters recommendations based on your interests, time and city.",
    catalogTitle: "Catalog",
    catalogDescription: "All City Posters events with search and filters.",
    plannedTitle: "Planned",
    plannedDescription: "Saved events and plans will appear here.",
    profileTitle: "My profile",
    profileDescription: "City Posters settings and your city-event interests.",
    preferencesTitle: "My City Posters",
    preferencesText: "Your interests, favorite categories, places and reminder settings will live here.",
    emptyHome: "Current events are not connected yet.",
    emptyForYou: "Personal recommendations will appear after events and interests are connected.",
    emptyCatalog: "The event catalog is not connected yet.",
    emptyPlanned: "You do not have any planned events yet.",
    now: "Now",
    today: "Today",
    tomorrow: "Tomorrow",
    weekend: "Weekend",
    all: "All",
    cinema: "Cinema",
    concerts: "Concerts",
    festivals: "Festivals",
    sport: "Sport",
    searchPlaceholder: "Search events, places and participants",
    navHome: "Home",
    navForYou: "For you",
    navCatalog: "Catalog",
    navPlanned: "Planned",
    navProfile: "My profile",
  },
  pl: {
    eyebrow: "Wydarzenia w mieście",
    homeTitle: "Program miasta",
    homeDescription: "Kino, koncerty, festiwale, sport i inne wydarzenia w mieście.",
    forYouTitle: "Dla Ciebie",
    forYouDescription: "Rekomendacje programu miasta według zainteresowań, czasu i miasta.",
    catalogTitle: "Katalog",
    catalogDescription: "Wszystkie wydarzenia w mieście z wyszukiwaniem i filtrami.",
    plannedTitle: "Zaplanowane",
    plannedDescription: "Zapisane wydarzenia i plany pojawią się tutaj.",
    profileTitle: "Mój profil",
    profileDescription: "Ustawienia programu miasta i Twoje zainteresowania wydarzeniami.",
    preferencesTitle: "Mój program",
    preferencesText: "Tutaj znajdą się zainteresowania, ulubione kategorie, miejsca i ustawienia przypomnień.",
    emptyHome: "Aktualne wydarzenia nie są jeszcze podłączone.",
    emptyForYou: "Spersonalizowane rekomendacje pojawią się po podłączeniu wydarzeń i zainteresowań.",
    emptyCatalog: "Katalog wydarzeń nie jest jeszcze podłączony.",
    emptyPlanned: "Nie masz jeszcze zaplanowanych wydarzeń.",
    now: "Teraz",
    today: "Dzisiaj",
    tomorrow: "Jutro",
    weekend: "Weekend",
    all: "Wszystkie",
    cinema: "Kino",
    concerts: "Koncerty",
    festivals: "Festiwale",
    sport: "Sport",
    searchPlaceholder: "Szukaj wydarzeń, miejsc i uczestników",
    navHome: "Główna",
    navForYou: "Dla Ciebie",
    navCatalog: "Katalog",
    navPlanned: "Zaplanowane",
    navProfile: "Mój profil",
  },
  sk: {
    eyebrow: "Podujatia v meste",
    homeTitle: "Program mesta",
    homeDescription: "Kino, koncerty, festivaly, šport a ďalšie mestské podujatia.",
    forYouTitle: "Pre vás",
    forYouDescription: "Odporúčania programu mesta podľa záujmov, času a mesta.",
    catalogTitle: "Katalóg",
    catalogDescription: "Všetky mestské podujatia s vyhľadávaním a filtrami.",
    plannedTitle: "Naplánované",
    plannedDescription: "Uložené podujatia a plány sa zobrazia tu.",
    profileTitle: "Môj profil",
    profileDescription: "Nastavenia programu mesta a vaše záujmy o mestské podujatia.",
    preferencesTitle: "Môj program",
    preferencesText: "Tu budú záujmy, obľúbené kategórie, miesta a nastavenia pripomienok.",
    emptyHome: "Aktuálne podujatia ešte nie sú pripojené.",
    emptyForYou: "Osobné odporúčania sa zobrazia po pripojení podujatí a záujmov.",
    emptyCatalog: "Katalóg podujatí ešte nie je pripojený.",
    emptyPlanned: "Zatiaľ nemáte žiadne naplánované podujatia.",
    now: "Teraz",
    today: "Dnes",
    tomorrow: "Zajtra",
    weekend: "Víkend",
    all: "Všetky",
    cinema: "Kino",
    concerts: "Koncerty",
    festivals: "Festivaly",
    sport: "Šport",
    searchPlaceholder: "Hľadať podujatia, miesta a účastníkov",
    navHome: "Domov",
    navForYou: "Pre vás",
    navCatalog: "Katalóg",
    navPlanned: "Naplánované",
    navProfile: "Môj profil",
  },
};

const timeFilters: CityPostersTimeFilter[] = ["now", "today", "tomorrow", "weekend"];
const categoryFilters: CityPostersCategory[] = ["all", "cinema", "concerts", "festivals", "sport"];
const homeCategories: Array<Exclude<CityPostersCategory, "all">> = ["cinema", "concerts", "festivals", "sport"];

export function CityPostersPage() {
  const language = useAppStore((state) => state.language);
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const setSelectedCity = useAppStore((state) => state.setSelectedCity);
  const [view, setView] = useState<CityPostersView>("home");
  const [timeFilter, setTimeFilter] = useState<CityPostersTimeFilter>("today");
  const [category, setCategory] = useState<CityPostersCategory>("all");
  const [query, setQuery] = useState("");
  const t = copy[language];
  const cityName = getCity(selectedCityId).name[language];

  useEffect(() => {
    readyMiniApp();
    expandMiniApp();
  }, []);

  useEffect(() => {
    if (view === "home") return undefined;
    return showBackButton(() => setView("home"));
  }, [view]);

  const timeLabel: Record<CityPostersTimeFilter, string> = {
    now: t.now,
    today: t.today,
    tomorrow: t.tomorrow,
    weekend: t.weekend,
  };
  const categoryLabel: Record<CityPostersCategory, string> = {
    all: t.all,
    cinema: t.cinema,
    concerts: t.concerts,
    festivals: t.festivals,
    sport: t.sport,
  };
  const categoryIcon: Record<Exclude<CityPostersCategory, "all">, React.ReactNode> = {
    cinema: <Film />,
    concerts: <Music />,
    festivals: <PartyPopper />,
    sport: <Trophy />,
  };

  const renderFilters = (showCategories = true) => (
    <>
      <div className="filter-row city-posters-filter-row" aria-label={`${t.homeTitle} time filters`}>
        {timeFilters.map((item) => (
          <button
            className={timeFilter === item ? "filter active" : "filter"}
            key={item}
            onClick={() => setTimeFilter(item)}
            type="button"
          >
            {timeLabel[item]}
          </button>
        ))}
      </div>
      {showCategories ? (
        <div className="filter-row city-posters-filter-row" aria-label={`${t.homeTitle} categories`}>
          {categoryFilters.map((item) => (
            <button
              className={category === item ? "filter active" : "filter"}
              key={item}
              onClick={() => setCategory(item)}
              type="button"
            >
              {categoryLabel[item]}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );

  const renderView = () => {
    if (view === "for-you") {
      return (
        <section className="page-section city-posters-page">
          <div className="page-title"><Sparkles /><div><h1>{t.forYouTitle}</h1><p>{t.forYouDescription}</p></div></div>
          <div className="empty-state city-posters-empty-state"><Sparkles /><p>{t.emptyForYou}</p></div>
        </section>
      );
    }

    if (view === "catalog") {
      return (
        <section className="page-section city-posters-page">
          <div className="page-title"><Compass /><div><h1>{t.catalogTitle}</h1><p>{cityName} · {t.catalogDescription}</p></div></div>
          <label className="discover-search city-posters-search">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} />
          </label>
          {renderFilters()}
          {category === "all" || category === "cinema"
            ? <CinemaPostersCatalog cityId={selectedCityId} language={language} timeFilter={timeFilter} query={query} />
            : <div className="empty-state city-posters-empty-state"><Compass /><p>{t.emptyCatalog}</p></div>}
        </section>
      );
    }

    if (view === "planned") {
      return (
        <section className="page-section city-posters-page">
          <div className="page-title"><CalendarDays /><div><h1>{t.plannedTitle}</h1><p>{t.plannedDescription}</p></div></div>
          <div className="empty-state city-posters-empty-state"><CalendarDays /><p>{t.emptyPlanned}</p></div>
        </section>
      );
    }

    if (view === "profile") {
      return (
        <section className="page-section city-posters-page">
          <div className="page-title"><CircleUserRound /><div><h1>{t.profileTitle}</h1><p>{t.profileDescription}</p></div></div>
          <article className="city-posters-profile-card">
            <CircleUserRound aria-hidden="true" />
            <div>
              <strong>{t.preferencesTitle}</strong>
              <span>{cityName}</span>
              <p>{t.preferencesText}</p>
            </div>
          </article>
        </section>
      );
    }

    return (
      <section className="page-section city-posters-page">
        <div className="city-posters-kicker">{t.eyebrow}</div>
        <div className="page-title"><CalendarDays /><div><h1>{t.homeTitle}</h1><p>{cityName} · {t.homeDescription}</p></div></div>
        <div className="city-posters-category-grid">
          {homeCategories.map((item) => (
            <button
              className="city-posters-category-card"
              data-category={item}
              key={item}
              onClick={() => {
                setCategory(item);
                setView("catalog");
              }}
              type="button"
            >
              {categoryIcon[item]}
              <strong>{categoryLabel[item]}</strong>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const navItems: Array<{ id: CityPostersView; label: string; icon: React.ReactNode }> = [
    { id: "home", label: t.navHome, icon: <Home /> },
    { id: "for-you", label: t.navForYou, icon: <Sparkles /> },
    { id: "catalog", label: t.navCatalog, icon: <Compass /> },
    { id: "planned", label: t.navPlanned, icon: <CalendarDays /> },
    { id: "profile", label: t.navProfile, icon: <CircleUserRound /> },
  ];

  return (
    <div className="app city-posters-app">
      <AppHeader
        language={language}
        selectedCityId={selectedCityId}
        translation={getTranslation(language)}
        onBrandClick={() => window.location.assign("/")}
        onCityChange={setSelectedCity}
        onLanguageChange={setLanguage}
      />
      <main className="main-content city-posters-content">{renderView()}</main>
      <nav className="bottom-nav city-posters-bottom-nav" aria-label={`${t.homeTitle} navigation`}>
        {navItems.map((item) => (
          <button
            className={view === item.id ? "nav-item active" : "nav-item"}
            key={item.id}
            onClick={() => setView(item.id)}
            type="button"
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
