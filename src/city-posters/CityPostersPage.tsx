import { useEffect, useState } from "react";
import { CalendarDays, CircleUserRound, Compass, Film, Home, Music, PartyPopper, Sparkles, Trophy } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { getCity } from "../config/cities";
import { getTranslation } from "../i18n";
import { enterCanonicalProfile } from "../profile/profileEntry";
import { useAppStore } from "../store";
import { expandMiniApp, readyMiniApp, showBackButton } from "../telegram";
import type { Language } from "../types";
import "../styles.css";
import "../category-cards.css";
import "./city-posters.css";
import { CinemaVisualFixture } from "./CinemaVisualFixture";
import { SportVisualFixture } from "./SportVisualFixture";

type CityPostersPrimaryView = "home" | "for-you" | "catalog" | "planned";
type CityPostersCategoryView = "for-you" | "catalog" | "planned";
type CityPostersCategory = "cinema" | "concerts" | "festivals" | "sport";

type CityPostersCopy = {
  eyebrow: string;
  homeTitle: string;
  homeDescription: string;
  emptyForYou: string;
  emptyCatalog: string;
  emptyPlanned: string;
  cinema: string;
  concerts: string;
  festivals: string;
  sport: string;
  navHome: string;
  navForYou: string;
  navCatalog: string;
  navPlanned: string;
  navProfile: string;
};

const copy: Record<Language, CityPostersCopy> = {
  ru: {
    eyebrow: "События города", homeTitle: "Афиша", homeDescription: "Кино, концерты, фестивали, спорт и другие события города.",
    emptyForYou: "Персональные рекомендации подключим отдельно.", emptyCatalog: "Каталог событий подключим отдельным этапом.", emptyPlanned: "Запланированные события подключим отдельно.",
    cinema: "Кино", concerts: "Концерты", festivals: "Фестивали", sport: "Спорт",
    navHome: "Главная", navForYou: "Для вас", navCatalog: "Каталог", navPlanned: "Запланировано", navProfile: "Профиль",
  },
  uk: {
    eyebrow: "Події міста", homeTitle: "Афіша", homeDescription: "Кіно, концерти, фестивалі, спорт та інші події міста.",
    emptyForYou: "Персональні рекомендації підключимо окремо.", emptyCatalog: "Каталог подій підключимо окремим етапом.", emptyPlanned: "Заплановані події підключимо окремо.",
    cinema: "Кіно", concerts: "Концерти", festivals: "Фестивалі", sport: "Спорт",
    navHome: "Головна", navForYou: "Для вас", navCatalog: "Каталог", navPlanned: "Заплановано", navProfile: "Профіль",
  },
  cs: {
    eyebrow: "Městské akce", homeTitle: "Program města", homeDescription: "Kino, koncerty, festivaly, sport a další městské akce.",
    emptyForYou: "Osobní doporučení připojíme samostatně.", emptyCatalog: "Katalog akcí připojíme v samostatné etapě.", emptyPlanned: "Naplánované akce připojíme samostatně.",
    cinema: "Kino", concerts: "Koncerty", festivals: "Festivaly", sport: "Sport",
    navHome: "Domů", navForYou: "Pro vás", navCatalog: "Katalog", navPlanned: "Naplánováno", navProfile: "Profil",
  },
  en: {
    eyebrow: "City events", homeTitle: "City Posters", homeDescription: "Cinema, concerts, festivals, sport and other city events.",
    emptyForYou: "Personal recommendations will be connected separately.", emptyCatalog: "The event catalog will be connected in a separate stage.", emptyPlanned: "Planned events will be connected separately.",
    cinema: "Cinema", concerts: "Concerts", festivals: "Festivals", sport: "Sport",
    navHome: "Home", navForYou: "For you", navCatalog: "Catalog", navPlanned: "Planned", navProfile: "Profile",
  },
  pl: {
    eyebrow: "Wydarzenia w mieście", homeTitle: "Program miasta", homeDescription: "Kino, koncerty, festiwale, sport i inne wydarzenia w mieście.",
    emptyForYou: "Rekomendacje osobiste podłączymy osobno.", emptyCatalog: "Katalog wydarzeń podłączymy w osobnym etapie.", emptyPlanned: "Zaplanowane wydarzenia podłączymy osobno.",
    cinema: "Kino", concerts: "Koncerty", festivals: "Festiwale", sport: "Sport",
    navHome: "Główna", navForYou: "Dla Ciebie", navCatalog: "Katalog", navPlanned: "Zaplanowane", navProfile: "Profil",
  },
  sk: {
    eyebrow: "Podujatia v meste", homeTitle: "Program mesta", homeDescription: "Kino, koncerty, festivaly, šport a ďalšie mestské podujatia.",
    emptyForYou: "Osobné odporúčania pripojíme samostatne.", emptyCatalog: "Katalóg podujatí pripojíme v samostatnej etape.", emptyPlanned: "Naplánované podujatia pripojíme samostatne.",
    cinema: "Kino", concerts: "Koncerty", festivals: "Festivaly", sport: "Šport",
    navHome: "Domov", navForYou: "Pre vás", navCatalog: "Katalóg", navPlanned: "Naplánované", navProfile: "Profil",
  },
};

const homeCategories: CityPostersCategory[] = ["cinema", "concerts", "festivals", "sport"];

export function CityPostersPage() {
  const language = useAppStore((state) => state.language);
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const setSelectedCity = useAppStore((state) => state.setSelectedCity);
  const [primaryView, setPrimaryView] = useState<CityPostersPrimaryView>("home");
  const [selectedCategory, setSelectedCategory] = useState<CityPostersCategory | null>(null);
  const [categoryView, setCategoryView] = useState<CityPostersCategoryView>("catalog");
  const t = copy[language];
  const cityName = getCity(selectedCityId).name[language];

  useEffect(() => {
    readyMiniApp();
    expandMiniApp();
  }, []);

  useEffect(() => {
    if (!selectedCategory) return undefined;
    return showBackButton(() => setSelectedCategory(null));
  }, [selectedCategory]);

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

  const openCategory = (category: CityPostersCategory, view: CityPostersCategoryView = "catalog") => {
    setCategoryView(view);
    setSelectedCategory(category);
  };

  const openProfile = () => {
    const currentView = useAppStore.getState().view;
    enterCanonicalProfile({
      currentView,
      setView: (nextView) => useAppStore.getState().setView(nextView),
      history: window.history,
      schedule: (callback) => window.requestAnimationFrame(() => callback()),
    });
  };

  const renderCategoryCards = () => (
    <div className="category-grid module-grid services-category-grid city-posters-category-grid">
      {homeCategories.map((item) => (
        <button
          className="category-button city-posters-category-card"
          data-category={item}
          key={item}
          onClick={() => openCategory(item)}
          type="button"
        >
          <strong>{categoryLabel[item]}</strong>
        </button>
      ))}
    </div>
  );

  const placeholder = (icon: React.ReactNode, text: string) => (
    <div className="empty-state city-posters-empty-state">{icon}<p>{text}</p></div>
  );

  const renderCategory = (category: CityPostersCategory) => {
    const label = categoryLabel[category];
    const body = categoryView === "for-you"
      ? category === "sport"
        ? <SportVisualFixture language={language} variant="for-you" />
        : category === "cinema"
          ? <CinemaVisualFixture language={language} variant="for-you" />
          : placeholder(<Sparkles />, t.emptyForYou)
      : categoryView === "planned"
        ? placeholder(<CalendarDays />, t.emptyPlanned)
        : category === "sport"
          ? <SportVisualFixture language={language} variant="catalog" />
          : category === "cinema"
            ? <CinemaVisualFixture language={language} variant="catalog" />
            : placeholder(<Compass />, t.emptyCatalog);

    return (
      <section className="page-section city-posters-page">
        <div className="page-title"><span className="city-posters-title-icon">{categoryIcon[category]}</span><div><h1>{label}</h1><p>{cityName} · {t.homeTitle}</p></div></div>
        {body}
      </section>
    );
  };

  const renderPrimaryView = () => {
    if (primaryView === "for-you") {
      return <section className="page-section city-posters-page"><div className="page-title"><Sparkles /><div><h1>{t.navForYou}</h1><p>{cityName} · {t.homeTitle}</p></div></div>{placeholder(<Sparkles />, t.emptyForYou)}</section>;
    }
    if (primaryView === "catalog") {
      return <section className="page-section city-posters-page"><div className="page-title"><Compass /><div><h1>{t.navCatalog}</h1><p>{cityName} · {t.homeTitle}</p></div></div>{renderCategoryCards()}</section>;
    }
    if (primaryView === "planned") {
      return <section className="page-section city-posters-page"><div className="page-title"><CalendarDays /><div><h1>{t.navPlanned}</h1><p>{cityName} · {t.homeTitle}</p></div></div>{placeholder(<CalendarDays />, t.emptyPlanned)}</section>;
    }
    return (
      <section className="page-section city-posters-page city-posters-home">
        <div className="city-posters-kicker">{t.eyebrow}</div>
        <div className="page-title"><Home /><div><h1>{t.homeTitle}</h1><p>{cityName} · {t.homeDescription}</p></div></div>
        {renderCategoryCards()}
      </section>
    );
  };

  const navItems: Array<{ id: CityPostersPrimaryView | "profile"; label: string; icon: React.ReactNode }> = [
    { id: "home", label: t.navHome, icon: <Home /> },
    { id: "for-you", label: t.navForYou, icon: <Sparkles /> },
    { id: "catalog", label: t.navCatalog, icon: <Compass /> },
    { id: "planned", label: t.navPlanned, icon: <CalendarDays /> },
    { id: "profile", label: t.navProfile, icon: <CircleUserRound /> },
  ];

  const navItemActive = (id: CityPostersPrimaryView | "profile") => {
    if (id === "profile") return false;
    if (!selectedCategory) return primaryView === id;
    if (id === "home") return false;
    return categoryView === id;
  };

  const navigateFromBottomNav = (id: CityPostersPrimaryView | "profile") => {
    if (id === "profile") {
      setSelectedCategory(null);
      openProfile();
      return;
    }
    if (id === "home") {
      setSelectedCategory(null);
      setPrimaryView("home");
      return;
    }
    if (selectedCategory && (id === "for-you" || id === "catalog" || id === "planned")) {
      setCategoryView(id);
      return;
    }
    setSelectedCategory(null);
    setPrimaryView(id);
  };

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
      <main className="main-content city-posters-content">
        {selectedCategory ? renderCategory(selectedCategory) : renderPrimaryView()}
      </main>
      <nav className="bottom-nav" aria-label={`${t.homeTitle} navigation`}>
        {navItems.map((item) => (
          <button className={navItemActive(item.id) ? "active" : ""} key={item.id} onClick={() => navigateFromBottomNav(item.id)} type="button">
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
