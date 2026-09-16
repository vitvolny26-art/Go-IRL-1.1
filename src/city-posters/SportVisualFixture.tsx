import type { Language } from "../types";

type SportFixtureVariant = "for-you" | "catalog";

type SportFixtureCopy = {
  badge: string;
  type: string;
};

const copy: Record<Language, SportFixtureCopy> = {
  ru: { badge: "Тестовый визуал", type: "Футбол" },
  uk: { badge: "Тестовий візуал", type: "Футбол" },
  cs: { badge: "Testovací vizuál", type: "Fotbal" },
  en: { badge: "Visual test", type: "Football" },
  pl: { badge: "Test wizualny", type: "Piłka nożna" },
  sk: { badge: "Testovací vizuál", type: "Futbal" },
};

export function SportVisualFixture({ language, variant }: { language: Language; variant: SportFixtureVariant }) {
  const t = copy[language];
  const className = `city-posters-sport-fixture city-posters-sport-fixture--${variant}`;

  return (
    <article className={className} aria-label="Sport visual fixture">
      <div className="city-posters-sport-fixture__media" aria-hidden="true" />
      <span className="city-posters-sport-fixture__badge">{t.badge}</span>
      <div className="city-posters-sport-fixture__content">
        <span className="city-posters-sport-fixture__type">{t.type}</span>
        <h2>Оломоуц — Прага</h2>
      </div>
    </article>
  );
}
