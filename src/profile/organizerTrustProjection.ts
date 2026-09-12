import type { Language } from "../types";

export type OrganizerTrustLocale = Language | "pl" | "sk";

/**
 * Derived organizer-level read model.
 *
 * Source of truth stays in canonical Activities + post-event feedback. This
 * contract must never become a second organizer-rating store inside UProfile.
 */
export type OrganizerTrustProjection = Readonly<{
  averageRating: number | null;
  ratingCount: number;
  completedActivityCount: number;
}>;

export type OrganizerTrustProjectionRow = Readonly<{
  average_rating: number | string | null;
  rating_count: number | string;
  completed_activity_count: number | string;
}>;

const finiteNumber = (value: number | string | null) => {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const nonNegativeInteger = (value: number | string) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

export const parseOrganizerTrustProjection = (
  row: OrganizerTrustProjectionRow,
): OrganizerTrustProjection | null => {
  const ratingCount = nonNegativeInteger(row.rating_count);
  const completedActivityCount = nonNegativeInteger(row.completed_activity_count);
  const averageRating = finiteNumber(row.average_rating);

  if (ratingCount === null || completedActivityCount === null) return null;
  if (ratingCount === 0) {
    if (averageRating !== null) return null;
    return { averageRating: null, ratingCount, completedActivityCount };
  }
  if (averageRating === null || averageRating < 1 || averageRating > 5) return null;

  return { averageRating, ratingCount, completedActivityCount };
};

type CountForms = Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }>;
type OrganizerTrustCopy = Readonly<{
  newOrganizer: string;
  noRatings: string;
  ratings: CountForms;
  activities: CountForms;
}>;

const copy: Record<OrganizerTrustLocale, OrganizerTrustCopy> = {
  ru: {
    newOrganizer: "Новый организатор",
    noRatings: "Пока нет оценок",
    ratings: { one: "оценка", few: "оценки", many: "оценок", other: "оценок" },
    activities: { one: "мероприятие", few: "мероприятия", many: "мероприятий", other: "мероприятий" },
  },
  uk: {
    newOrganizer: "Новий організатор",
    noRatings: "Поки немає оцінок",
    ratings: { one: "оцінка", few: "оцінки", many: "оцінок", other: "оцінок" },
    activities: { one: "захід", few: "заходи", many: "заходів", other: "заходів" },
  },
  cs: {
    newOrganizer: "Nový organizátor",
    noRatings: "Zatím bez hodnocení",
    ratings: { one: "hodnocení", few: "hodnocení", other: "hodnocení" },
    activities: { one: "akce", few: "akce", other: "akcí" },
  },
  en: {
    newOrganizer: "New organizer",
    noRatings: "No ratings yet",
    ratings: { one: "rating", other: "ratings" },
    activities: { one: "event", other: "events" },
  },
  pl: {
    newOrganizer: "Nowy organizator",
    noRatings: "Brak ocen",
    ratings: { one: "ocena", few: "oceny", many: "ocen", other: "oceny" },
    activities: { one: "wydarzenie", few: "wydarzenia", many: "wydarzeń", other: "wydarzenia" },
  },
  sk: {
    newOrganizer: "Nový organizátor",
    noRatings: "Zatiaľ bez hodnotení",
    ratings: { one: "hodnotenie", few: "hodnotenia", other: "hodnotení" },
    activities: { one: "podujatie", few: "podujatia", other: "podujatí" },
  },
};

const countLabel = (count: number, locale: OrganizerTrustLocale, forms: CountForms) => {
  const category = new Intl.PluralRules(locale).select(count);
  return `${count} ${forms[category] || forms.other}`;
};

export const buildOrganizerTrustSummary = (
  projection: OrganizerTrustProjection,
  locale: OrganizerTrustLocale,
) => {
  const labels = copy[locale];
  const activities = countLabel(projection.completedActivityCount, locale, labels.activities);

  if (projection.ratingCount === 0) {
    return projection.completedActivityCount === 0
      ? `${labels.newOrganizer} · ${activities}`
      : `${activities} · ${labels.noRatings}`;
  }

  const rating = projection.averageRating?.toFixed(1);
  const ratings = countLabel(projection.ratingCount, locale, labels.ratings);
  return `⭐ ${rating} · ${ratings} · ${activities}`;
};
