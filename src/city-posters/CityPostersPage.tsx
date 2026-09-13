import { CalendarDays } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { ProductDomainTabs } from "../components/ProductDomainTabs";
import { getTranslation } from "../i18n";
import { useAppStore } from "../store";
import type { Language } from "../types";
import "./city-posters.css";

type CityPostersCopy = {
  eyebrow: string;
  description: string;
  emptyTitle: string;
  emptyText: string;
  now: string;
  today: string;
  tomorrow: string;
  weekend: string;
  all: string;
  cinema: string;
  concerts: string;
  festivals: string;
  sport: string;
};

const copy: Record<Language, CityPostersCopy> = {
  ru: {
    eyebrow: "Городские события",
    description: "Отдельная логика городских событий: кино, концерты, фестивали и спорт.",
    emptyTitle: "City Posters подключён",
    emptyText: "Каркас готов. Источники и реальные события подключаются отдельными следующими этапами.",
    now: "Сейчас",
    today: "Сегодня",
    tomorrow: "Завтра",
    weekend: "Выходные",
    all: "Все",
    cinema: "Кино",
    concerts: "Концерты",
    festivals: "Фестивали",
    sport: "Спорт",
  },
  uk: {
    eyebrow: "Міські події",
    description: "Окрема логіка міських подій: кіно, концерти, фестивалі та спорт.",
    emptyTitle: "City Posters підключено",
    emptyText: "Каркас готовий. Джерела та реальні події підключаються окремими наступними етапами.",
    now: "Зараз",
    today: "Сьогодні",
    tomorrow: "Завтра",
    weekend: "Вихідні",
    all: "Усі",
    cinema: "Кіно",
    concerts: "Концерти",
    festivals: "Фестивалі",
    sport: "Спорт",
  },
  cs: {
    eyebrow: "Městské akce",
    description: "Samostatná logika městských akcí: kino, koncerty, festivaly a sport.",
    emptyTitle: "City Posters je připojen",
    emptyText: "Základ je připraven. Zdroje a živé události budou přidány v dalších samostatných krocích.",
    now: "Teď",
    today: "Dnes",
    tomorrow: "Zítra",
    weekend: "Víkend",
    all: "Vše",
    cinema: "Kino",
    concerts: "Koncerty",
    festivals: "Festivaly",
    sport: "Sport",
  },
  en: {
    eyebrow: "City events",
    description: "Independent city-event logic for cinema, concerts, festivals and sport.",
    emptyTitle: "City Posters is connected",
    emptyText: "The shell is ready. Sources and live events will be added in separate follow-up increments.",
    now: "Now",
    today: "Today",
    tomorrow: "Tomorrow",
    weekend: "Weekend",
    all: "All",
    cinema: "Cinema",
    concerts: "Concerts",
    festivals: "Festivals",
    sport: "Sport",
  },
};

export function CityPostersPage() {
  const language = useAppStore((state) => state.language);
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const setSelectedCity = useAppStore((state) => state.setSelectedCity);
  const t = copy[language];

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
      <ProductDomainTabs activeDomain="city-posters" />
      <main className="city-posters-main" aria-labelledby="city-posters-title">
        <section className="city-posters-intro">
          <span className="city-posters-eyebrow">{t.eyebrow}</span>
          <h1 id="city-posters-title">City Posters</h1>
          <p>{t.description}</p>
        </section>

        <div className="city-posters-filter-row" aria-label="City Posters time filters">
          {[t.now, t.today, t.tomorrow, t.weekend].map((label, index) => (
            <button key={label} type="button" className={index === 1 ? "active" : ""} disabled>
              {label}
            </button>
          ))}
        </div>

        <div className="city-posters-filter-row city-posters-category-row" aria-label="City Posters categories">
          {[t.all, t.cinema, t.concerts, t.festivals, t.sport].map((label, index) => (
            <button key={label} type="button" className={index === 0 ? "active" : ""} disabled>
              {label}
            </button>
          ))}
        </div>

        <section className="city-posters-empty-state" aria-live="polite">
          <CalendarDays aria-hidden="true" />
          <h2>{t.emptyTitle}</h2>
          <p>{t.emptyText}</p>
        </section>
      </main>
    </div>
  );
}
