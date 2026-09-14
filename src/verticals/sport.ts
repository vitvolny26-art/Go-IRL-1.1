import { getCity } from "../config/cities";
import type { Activity, Language, SportEnvironment, SportFormat, SportLevel, SportMetadata } from "../types";
import type { RecommendationContext, RecommendationEngine } from "../recommendations";

export const sportLevels: Array<{ id: SportLevel; label: Record<Language, string> }> = [
  { id: "beginner", label: { ru: "Новичок", uk: "Новачок", cs: "Začátečník", en: "Beginner" , pl: "Beginner", sk: "Začátečník"} },
  { id: "intermediate", label: { ru: "Любитель", uk: "Аматор", cs: "Rekreační", en: "Casual" , pl: "Casual", sk: "Rekreační"} },
  { id: "advanced", label: { ru: "Продвинутый", uk: "Просунутий", cs: "Pokročilý", en: "Advanced" , pl: "Advanced", sk: "Pokročilý"} },
];

export const sportFormats: Array<{ id: SportFormat; label: Record<Language, string> }> = [
  { id: "casual", label: { ru: "Любительский", uk: "Аматорський", cs: "Rekreační", en: "Casual" , pl: "Casual", sk: "Rekreační"} },
  { id: "training", label: { ru: "Тренировка", uk: "Тренування", cs: "Trénink", en: "Training" , pl: "Training", sk: "Trénink"} },
  { id: "competition", label: { ru: "Соревнование", uk: "Змагання", cs: "Soutěž", en: "Competition" , pl: "Competition", sk: "Soutěž"} },
];

export const sportEnvironments: Array<{ id: SportEnvironment; label: Record<Language, string> }> = [
  { id: "indoor", label: { ru: "В помещении", uk: "У приміщенні", cs: "Uvnitř", en: "Indoor" , pl: "Indoor", sk: "Uvnitř"} },
  { id: "outdoor", label: { ru: "На улице", uk: "На вулиці", cs: "Venku", en: "Outdoor" , pl: "Outdoor", sk: "Venku"} },
];

export const sportDemoBlueprints = [
  { icon: "⚽", label: "Football", level: "intermediate" },
  { icon: "🏐", label: "Volleyball", level: "beginner" },
  { icon: "🎾", label: "Tennis", level: "intermediate" },
  { icon: "🏃", label: "Running", level: "beginner" },
  { icon: "🚴", label: "Cycling", level: "intermediate" },
  { icon: "🛼", label: "Inline skating", level: "beginner" },
  { icon: "🥾", label: "Hiking", level: "beginner" },
  { icon: "🏊", label: "Swimming", level: "intermediate" },
  { icon: "🏸", label: "Badminton", level: "beginner" },
  { icon: "🏋️", label: "Fitness", level: "advanced" },
] satisfies Array<{ icon: string; label: string; level: SportLevel }>;

export function isSportActivity(activity: Activity) {
  return activity.type === "sport" || activity.categoryId === "sport";
}

export function getSportMetadata(activity: Activity): SportMetadata {
  return activity.metadata?.sport || {};
}

export function sportLevelLabel(level: SportLevel | undefined, language: Language) {
  return (sportLevels.find((item) => item.id === level) || sportLevels[1]).label[language];
}

export function sportFormatLabel(format: SportFormat | undefined, language: Language) {
  return (sportFormats.find((item) => item.id === format) || sportFormats[0]).label[language];
}

export function sportEnvironmentLabel(environment: SportEnvironment | undefined, language: Language) {
  return (sportEnvironments.find((item) => item.id === environment) || sportEnvironments[1]).label[language];
}

export type SportRecommendationContext = RecommendationContext & {
  preferredSportLevel?: SportLevel;
  preferredSportTypes?: string[];
};

const normalized = (value: string) => value.toLocaleLowerCase();

export class SportRecommendationEngine implements RecommendationEngine {
  readonly id = "sport" as const;

  recommend(activities: Activity[], context: SportRecommendationContext) {
    const today = (context.now || new Date()).toISOString().slice(0, 10);
    return [...activities]
      .filter((activity) => isSportActivity(activity) && activity.date >= today)
      .sort((left, right) => this.score(right, context) - this.score(left, context));
  }

  private score(activity: Activity, context: SportRecommendationContext) {
    const meta = getSportMetadata(activity);
    const cityScore = activity.cityId === context.cityId ? 80 : 0;
    const levelScore = context.preferredSportLevel && meta.level === context.preferredSportLevel ? 38 : 0;
    const sportType = normalized(meta.sportType || activity.activity[context.language] || "");
    const typeScore = (context.preferredSportTypes || []).some((item) => sportType.includes(normalized(item))) ? 42 : 0;
    const freeSpots = Math.max(activity.capacity - activity.participants, 0);
    const spotScore = freeSpots > 0 ? Math.min(20, freeSpots * 3) : -30;
    const cityName = getCity(activity.cityId).name[context.language];
    const cityTextScore = activity.address.toLocaleLowerCase().includes(cityName.toLocaleLowerCase()) ? 5 : 0;

    return cityScore + levelScore + typeScore + spotScore + cityTextScore;
  }
}

export const sportRecommendationEngine = new SportRecommendationEngine();
