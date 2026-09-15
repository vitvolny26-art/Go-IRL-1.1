import { useEffect, useState } from "react";
import { Compass, Film, Home, Music, PartyPopper, Search, Sparkles, Trophy } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { getCity } from "../config/cities";
import { getTranslation } from "../i18n";
import { useAppStore } from "../store";
import { expandMiniApp, readyMiniApp, showBackButton } from "../telegram";
import type { Language } from "../types";
import { CinemaPostersCatalog } from "./cinema/CinemaPostersCatalog";
import type { CinemaPosterTimeFilter } from "./cinema/cinemaModel";
import "../styles.css";
import "./city-posters.css";

type CityPostersSection = "home" | "cinema" | "concerts" | "sport" | "festivals";
type CityPostersCategoryView = "for-you" | "catalog";
type CityPostersTimeFilter = CinemaPosterTimeFilter;
type CityPostersCategory = Exclude<CityPostersSection, "home">;

type CityPostersCopy = {
  eyebrow: string;
  homeTitle: string;
  homeDescription: string;
  emptyForYou: string;
  emptyCatalog: string;
  now: string;
  today: string;
  tomorrow: string;
  weekend: string;
  cinema: string;
  concerts: string;
  festivals: string;
  sport: string;
  searchPlaceholder: string;
  navHome: string;
  navForYou: string;
  navCatalog: string;
};

const copy: Record<Language, CityPostersCopy> = {
  ru: {
    eyebrow: "События города", homeTitle: "Афиша", homeDescription: "Кино, концерты, фестивали, спорт и другие события города.",
    emptyForYou: "Персональные рекомендации появятся после подключения событий и интересов.", emptyCatalog: "Каталог событий пока не подключён.",
    now: "Сейчас", today: "Сегодня", tomorrow: "Завтра", weekend: "Выходные",
    cinema: "Кино", concerts: "Концерты", festivals: "Фестивали", sport: "Спорт",
    searchPlaceholder: "Искать события, места и участников", navHome: "Главная", navForYou: "Для вас", navCatalog: "Каталог",
  },
  uk: {
    eyebrow: "Події міста", homeTitle: "Афіша", homeDescription: "Кіно, концерти, фестивалі, спорт та інші події міста.",
    emptyForYou: "Персональні рекомендації з'являться після підключення подій та інтересів.", emptyCatalog: "Каталог подій поки не підключений.",
    now: "Зараз", today: "Сьогодні", tomorrow: "Завтра", weekend: "Вихідні",
    cinema: "Кіно", concerts: "Концерти", festivals: "Фестивалі", sport: "Спорт",
    searchPlaceholder: "Шукати події, місця та учасників", navHome: "Головна", navForYou: "Для вас", navCatalog: "Каталог",
  },
  cs: {
    eyebrow: "Městské akce", homeTitle: "Program města", homeDescription: "Kino, koncerty, festivaly, sport a další městské akce.",
    emptyForYou: "Osobní doporučení se zobrazí po připojení akcí a zájmů.", emptyCatalog: "Katalog akcí zatím není připojený.",
    now: "Teď", today: "Dnes", tomorrow: "Zítra", weekend: "Víkend",
    cinema: "Kino", concerts: "Koncerty", festivals: "Festivaly", sport: "Sport",
    searchPlaceholder: "Hledat akce, místa a účastníky", navHome: "Domů", navForYou: "Pro vás", navCatalog: "Katalog",
  },
  en: {
    eyebrow: "City events", homeTitle: "City Posters", homeDescription: "Cinema, concerts, festivals, sport and other city events.",
    emptyForYou: "Personal recommendations will appear after events and interests are connected.", emptyCatalog: "The event catalog is not connected yet.",
    now: "Now", today: "Today", tomorrow: "Tomorrow", weekend: "Weekend",
    cinema: "Cinema", concerts: "Concerts", festivals: "Festivals", sport: "Sport",
    searchPlaceholder: "Search events, places and participants", navHome: "Home", navForYou: "For you", navCatalog: "Catalog",
  },
  pl: {
    eyebrow: "Wydarzenia w mieście", homeTitle: "Program miasta", homeDescription: "Kino, koncerty, festiwale, sport i inne wydarzenia w mieście.",
    emptyForYou: "Spersonalizowane rekomendacje pojawią się po podłączeniu wydarzeń i zainteresowań.", emptyCatalog: "Katalog wydarzeń nie jest jeszcze podłączony.",
    now: "Teraz", today: "Dzisiaj", tomorrow: "Jutro", weekend: "Weekend",
    cinema: "Kino", concerts: "Koncerty", festivals: "Festiwale", sport: "Sport",
    searchPlaceholder: "Szukaj wydarzeń, miejsc i uczestników", navHome: "Główna", navForYou: "Dla Ciebie", navCatalog: "Katalog",
  },
  sk: {
    eyebrow: "Podujatia v meste", homeTitle: "Program mesta", homeDescription: "Kino, koncerty, festivaly, šport a ďalšie mestské podujatia.",
    emptyForYou: "Osobné odporúčania sa zobrazia po pripojení podujatí a záujmov.", emptyCatalog: "Katalóg podujatí ešte nie je pripojený.",
    now: "Teraz", today: "Dnes", tomorrow: "Zajtra", weekend: "Víkend",
    cinema: "Kino", concerts: "Koncerty", festivals: "Festivaly", sport: "Šport",
    searchPlaceholder: "Hľadať podujatia, miesta a účastníkov", navHome: "Domov", navForYou: "Pre vás", navCatalog: "Katalóg",
  },
};

const timeFilters: CityPostersTimeFilter[] = ["now", "today", "tomorrow", "weekend"];
const homeCategories: CityPostersCategory[] = ["cinema", "concerts", "festivals", "sport"];

export function CityPostersPage() {
  const language = useAppStore((state) => state.language);
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const setSelectedCity = useAppStore((state) => state.setSelectedCity);
  const [section, setSection] = useState<CityPostersSection>("home");
  const [categoryView, setCategoryView] = useState<CityPostersCategoryView>("for-you");
  const [timeFilter, setTimeFilter] = useState<CityPostersTimeFilter>("today");
  const [query, setQuery] = useState("");
  const t = copy[language];
  const cityName = getCity(selectedCityId).name[language];

  useEffect(() => {
    readyMiniApp();
    expandMiniApp();
  }, []);

  useEffect(() => {
    if (section === "home") return undefined;
    return showBackButton(() => setSection("home"));
  }, [section]);

  const timeLabel: Record<CityPostersTimeFilter, string> = {
    now: t.now,
    today: t.today,
    tomorrow: t.tomorrow,
    weekend: t.weekend,
  };

  const categoryLabel: Record<CityPostersCategory, string> = {
    cinema: t.cinema,
    concerts: t.concerts,
    festivals: t.festivals,
    sport: t.sport,
  };

  const categoryIcon: Record<CityPostersCategory, React.ReactNode> = {
    cinema: <Film />,
    concerts: <Music />,
    festivals: <PartyPopper />,
    sport: <Trophy />,
  };

  const renderTimeFilters = () => (
    <div className="filter-row city-posters-filter-row" aria-label={`${t.homeTitle} time filters`}>
      {timeFilters.map((item) => (
        <button className={timeFilter === item ? "filter active" : "filter"} key={item} onClick={() => setTimeFilter(item)} type="button">
          {timeLabel[item]}
        </button>
      ))}
    </div>
  );

  const renderCategory = (category: CityPostersCategory) => {
    const isCinema = category === "cinema";
    const label = categoryLabel[category];
    return (
      <section className="page-section city-posters-page">
        <div className="page-title"><span className="city-posters-title-icon">{categoryIcon[category]}</span><div><h1>{label}</h1><p>{cityName} · {t.homeTitle}</p></div></div>
        <div className="city-posters-category-tabs" role="tablist" aria-label={`${label} navigation`}>
          <button className={categoryView === "for-you" ? "active" : ""} onClick={() => setCategoryView("for-you")} role="tab" aria-selected={categoryView === "for-you"} type="button">
            <Sparkles /><span>{t.navForYou}</span>
          </button>
          <button className={categoryView === "catalog" ? "active" : ""} onClick={() => setCategoryView("catalog")} role="tab" aria-selected={categoryView === "catalog"} type="button">
            <Compass /><span>{t.navCatalog}</span>
          </button>
        </div>

        {categoryView === "for-you" ? (
          isCinema
            ? <CinemaPostersCatalog cityId={selectedCityId} language={language} variant="for-you" />
            : <div className="empty-state city-posters-empty-state"><Sparkles /><p>{t.emptyForYou}</p></div>
        ) : (
          <>
            <label className="discover-search city-posters-search">
              <Search />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} />
            </label>
            {renderTimeFilters()}
            {isCinema
              ? <CinemaPostersCatalog cityId={selectedCityId} language={language} timeFilter={timeFilter} query={query} variant="catalog" />
              : <div className="empty-state city-posters-empty-state"><Compass /><p>{t.emptyCatalog}</p></div>}
          </>
        )}
      </section>
    );
  };

  const renderView = () => {
    if (section !== "home") return renderCategory(section);
    return (
      <section className="page-section city-posters-page">
        <div className="city-posters-kicker">{t.eyebrow}</div>
        <div className="page-title"><Home /><div><h1>{t.homeTitle}</h1><p>{cityName} · {t.homeDescription}</p></div></div>
        <div className="city-posters-category-grid">
          {homeCategories.map((item) => (
            <button className="city-posters-category-card" data-category={item} key={item} onClick={() => { setCategoryView("catalog"); setSection(item); }} type="button">
              {categoryIcon[item]}
              <strong>{categoryLabel[item]}</strong>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const navItems: Array<{ id: CityPostersSection; label: string; icon: React.ReactNode }> = [
    { id: "home", label: t.navHome, icon: <Home /> },
    { id: "concerts", label: t.concerts, icon: <Music /> },
    { id: "sport", label: t.sport, icon: <Trophy /> },
    { id: "festivals", label: t.festivals, icon: <PartyPopper /> },
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
          <button className={section === item.id ? "nav-item active" : "nav-item"} key={item.id} onClick={() => { setCategoryView("for-you"); setSection(item.id); }} type="button">
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
