import { categories } from "./data";
import { getCity } from "./config/cities";
import { isActivityFinished, resolveEventInteractionState } from "./eventInteractionState";
import { getHierarchyProgram, getTopLevelActivities, isHierarchyCategory, isHierarchyContainer } from "./activityHierarchy";
import type { Activity, Language } from "./types";

export type DiscoverFilter =
  | "today"
  | "tomorrow"
  | "weekend"
  | "free"
  | "up-to-200"
  | "sport"
  | "board-games"
  | "skating"
  | "walks"
  | "coffee"
  | "beginners"
  | "public-only";

export type RecommendationContext = {
  cityId: string;
  favoriteActivities: string[];
  language: Language;
  now?: Date;
};

export type RecommendationEngineId = "generic" | "sport" | "friends" | "dating" | "ai";

export interface RecommendationEngine {
  readonly id: RecommendationEngineId;
  recommend(activities: Activity[], context: RecommendationContext): Activity[];
}

export type SurpriseRecommendationContext = {
  userKey: string;
  joinedIds: string[];
  waitingIds: string[];
  pendingIds: string[];
  cancelledIds?: string[];
  waitingListEnabledIds?: string[];
  now?: Date;
};

export const actionableSurpriseActivities = (
  activities: Activity[],
  context: SurpriseRecommendationContext,
) => {
  const joinedIds = new Set(context.joinedIds);
  const waitingIds = new Set(context.waitingIds);
  const pendingIds = new Set(context.pendingIds);
  const cancelledIds = new Set(context.cancelledIds || []);
  const waitingListEnabledIds = new Set(context.waitingListEnabledIds || []);

  return activities.filter((activity) => {
    if (cancelledIds.has(activity.id) || isHierarchyContainer(activity)) return false;

    const interaction = resolveEventInteractionState({
      isOrganizer: activity.organizerKey === context.userKey,
      isJoined: joinedIds.has(activity.id),
      isWaiting: waitingIds.has(activity.id),
      isPending: pendingIds.has(activity.id),
      isFull: activity.participants >= activity.capacity,
      visibility: activity.visibility,
      isFinished: isActivityFinished(activity, context.now),
      hasWaitingList: waitingListEnabledIds.has(activity.id),
    });

    return interaction.canJoin && !interaction.disabled;
  });
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const todayKey = (now = new Date()) => dateKey(now);

const tomorrowKey = (now = new Date()) => {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return dateKey(tomorrow);
};

const isWeekendDate = (date: string) => {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
};

const normalizedText = (value: string) => value.toLocaleLowerCase();

const interestSynonyms: Record<string, string[]> = {
  coffee: ["кофе", "кава", "káva", "coffee", "☕"],
  walks: ["прогул", "прогуля", "procház", "walk", "🚶"],
  skating: ["ролик", "inline", "brusl", "skating", "🛼"],
  cycling: ["велосипед", "велосип", "kolo", "cycling", "bike", "🚲"],
  running: ["бег", "біг", "běh", "running", "🏃"],
  hiking: ["поход", "похід", "výlet", "hike", "🥾"],
  "board-games": ["настол", "deskov", "board", "🎲"],
  football: ["футбол", "fotbal", "football", "⚽"],
  tennis: ["теннис", "теніс", "tenis", "tennis", "🎾"],
  volleyball: ["волейбол", "volejbal", "volleyball", "🏐"],
  basketball: ["баскетбол", "basketbal", "basketball", "🏀"],
  swimming: ["плав", "plav", "swimming", "🏊"],
  yoga: ["йога", "jóga", "yoga", "🧘"],
  fitness: ["фитнес", "фітнес", "fitness", "gym", "зал", "🏋"],
  concerts: ["концерт", "koncert", "concert", "🎵"],
  cinema: ["кино", "кіно", "kino", "cinema", "movie", "🎬"],
  food: ["еда", "їжа", "jídlo", "food", "dinner", "ужин", "вечеря", "🍽"],
  "language-exchange": ["языковой", "мовний", "jazyk", "language exchange", "🗣"],
};

const activityHaystack = (activity: Activity, language: Language) => [
  activity.activity[language],
  activity.title[language],
  activity.description[language],
  activity.address,
  activity.organizer,
  getCity(activity.cityId).name[language],
  categories.find((category) => category.id === activity.categoryId)?.name[language] || "",
].join(" ").toLocaleLowerCase();

export const matchesActivityInterest = (activity: Activity, interests: string[], language: Language) => {
  if (!interests.length) return false;
  const haystack = activityHaystack(activity, language);
  return interests.some((interest) => {
    const terms = interestSynonyms[interest] || [interest];
    return terms.some((term) => haystack.includes(normalizedText(term)));
  });
};

export const matchesActivityHierarchyInterest = (
  activities: Activity[],
  activity: Activity,
  interests: string[],
  language: Language,
) => {
  if (matchesActivityInterest(activity, interests, language)) return true;
  const program = getHierarchyProgram(activities, activity.id);
  if (!program) return false;
  const descendants = [
    ...program.sections.map((section) => section.category),
    ...program.sections.flatMap((section) => section.events),
    ...program.ungroupedEvents,
  ];
  return descendants.some((descendant) => matchesActivityInterest(descendant, interests, language));
};

export const searchActivities = (activities: Activity[], query: string, language: Language) => {
  const normalizedQuery = normalizedText(query.trim());
  if (!normalizedQuery) return getTopLevelActivities(activities);
  return activities.filter((activity) =>
    !isHierarchyCategory(activity)
    && activityHaystack(activity, language).includes(normalizedQuery));
};

const filterMatches = (activity: Activity, filter: DiscoverFilter, now: Date, language: Language) => {
  const haystack = activityHaystack(activity, language);
  switch (filter) {
    case "today":
      return activity.date === todayKey(now);
    case "tomorrow":
      return activity.date === tomorrowKey(now);
    case "weekend":
      return isWeekendDate(activity.date);
    case "free":
      return activity.price === 0;
    case "up-to-200":
      return activity.price <= 200;
    case "sport":
      return activity.categoryId === "sport";
    case "board-games":
      return haystack.includes("настол") || haystack.includes("deskov") || haystack.includes("board") || activity.activity[language].includes("🎲");
    case "skating":
      return haystack.includes("ролик") || haystack.includes("inline") || haystack.includes("brusl") || activity.activity[language].includes("🛼");
    case "walks":
      return haystack.includes("прогул") || haystack.includes("прогуля") || haystack.includes("procház") || haystack.includes("walk") || activity.activity[language].includes("🚶");
    case "coffee":
      return haystack.includes("кофе") || haystack.includes("кава") || haystack.includes("káva") || haystack.includes("coffee") || activity.activity[language].includes("☕");
    case "beginners":
      return haystack.includes("нович") || haystack.includes("новач") || haystack.includes("začáte") || haystack.includes("beginner");
    case "public-only":
      return activity.visibility === "public";
  }
};

export const applyDiscoverFilters = (activities: Activity[], filters: DiscoverFilter[], language: Language, now = new Date()) => {
  if (!filters.length) return activities;
  return activities.filter((activity) => filters.every((filter) => filterMatches(activity, filter, now, language)));
};

export class SimpleRecommendationEngine implements RecommendationEngine {
  readonly id: RecommendationEngineId = "generic";

  recommend(activities: Activity[], context: RecommendationContext) {
    const nowKey = todayKey(context.now || new Date());
    return getTopLevelActivities(activities)
      .filter((activity) => activity.date >= nowKey)
      .sort((left, right) => this.score(right, context, activities) - this.score(left, context, activities));
  }

  private score(activity: Activity, context: RecommendationContext, activities: Activity[]) {
    const now = context.now || new Date();
    const eventTime = new Date(`${activity.date}T${activity.time || "12:00"}:00`).getTime();
    const daysAway = Math.max(0, Math.round((eventTime - now.getTime()) / 86_400_000));
    const freeSpots = Math.max(activity.capacity - activity.participants, 0);
    const cityScore = activity.cityId === context.cityId ? 80 : 0;
    const interestScore = matchesActivityHierarchyInterest(activities, activity, context.favoriteActivities, context.language) ? 55 : 0;
    const dateScore = Math.max(0, 40 - daysAway * 4);
    const spotScore = freeSpots > 0 ? Math.min(20, freeSpots * 4) : -20;
    const popularityScore = activity.popular ? 12 : 0;

    return cityScore + interestScore + dateScore + spotScore + popularityScore;
  }
}

export class GenericRecommendationEngine extends SimpleRecommendationEngine {}

export class AIRecommendationEngine implements RecommendationEngine {
  readonly id: RecommendationEngineId = "ai";

  recommend(activities: Activity[], context: RecommendationContext) {
    return new GenericRecommendationEngine().recommend(activities, context);
  }
}

export const simpleRecommendationEngine = new SimpleRecommendationEngine();
export const genericRecommendationEngine = new GenericRecommendationEngine();

export const plannedRecommendationEngines: RecommendationEngineId[] = ["friends", "dating", "ai"];
