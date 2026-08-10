import { create } from "zustand";
import { categories } from "./data";
import { supabase, getUserKey } from "./supabase";
import {
  getCurrentAuthIdentity,
  getCurrentDisplayName,
  getCurrentStartParam,
  getCurrentUserRole as getTrustedUserRole,
  initializeTrustedAuth,
  isLegacyDemoAuthEnabled,
  isTrustedAuthReady } from "./authSession";
import { getCurrentUserRole, isCurrentUserAdmin } from "./config/admin";
import { cities, defaultCityId } from "./config/cities";
import { getTranslation } from "./i18n";
import type { Activity, ActivityMetadata, ActivityType, AppView, Language, NewActivity, UserRole } from "./types";
import { activityIdFromJoinPath } from "./invitationLink";
import { resolveActivityEntryIntent } from "./auth/activityEntryIntent";
import { supportsTrustedCoreAccess } from "./auth/trustedCoreAccess";
import { ensureFirstOnboardingComplete } from "./onboarding/firstOnboarding";
import { localDateKey, reconcileVisualDemoSnapshot } from "./visualDemoState";

type JoinResult = "joined" | "pending" | "left" | "full" | "private";

type DbActivity = {
  id: string;
  category_id: string;
  activity_ru: string;
  activity_cs: string;
  title_ru: string;
  title_cs: string;
  description_ru: string;
  description_cs: string;
  event_date: string;
  event_time: string;
  city_id?: string | null;
  address: string;
  location_url: string | null;
  participant_note?: string | null;
  activity_type?: ActivityType | null;
  metadata?: ActivityMetadata | null;
  price: number;
  capacity: number;
  organizer: string;
  organizer_key: string;
  visibility: Activity["visibility"];
  urgent: boolean;
  popular: boolean;
};

type DbMember = {
  activity_id: string;
  user_key: string;
  display_name: string;
  status: "joined" | "waiting" | "pending";
};

type AppState = {
  language: Language;
  selectedCityId: string;
  view: AppView;
  activities: Activity[];
  joinedIds: string[];
  waitingIds: string[];
  pendingIds: string[];
  selectedCategory: string | null;
  loading: boolean;
  syncError: string | null;
  userRole: UserRole;
  initialize: () => Promise<void>;
  disposeRealtime: () => void;
  setLanguage: (language: Language) => void;
  setSelectedCity: (cityId: string) => void;
  setView: (view: AppView) => void;
  setCategory: (id: string | null) => void;
  toggleJoin: (id: string) => Promise<JoinResult>;
  createActivity: (activity: NewActivity) => Promise<string>;
  updateActivity: (id: string, activity: NewActivity) => Promise<string>;
  deleteActivity: (id: string) => Promise<void>;
  reviewRequest: (activityId: string, memberKey: string, approved: boolean) => Promise<void>;
};

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

// go-irl-visual-demo-mode-v1
const visualDemoStorageKey = "go-irl-visual-demo-activities-v3";
const visualDemoUserKey = "telegram:999999";
const visualDemoUserName = "Vit_Test";
const visualDemoNotice = "\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b (\u0414\u0435\u043c\u043e-\u0440\u0435\u0436\u0438\u043c)";
const isVisualDemoMode = () =>
  typeof window !== "undefined" &&
  isLegacyDemoAuthEnabled() &&
  !isTrustedAuthReady();

export const resolveCurrentUserRole = (): UserRole => {
  const trustedRole = getTrustedUserRole();
  return trustedRole === "user" ? getCurrentUserRole(getUserKey()) : trustedRole;
};

const demoLocalized = (value: string) => ({ ru: value, uk: value, cs: value, en: value });

const createSeedDemoActivities = (): Activity[] => {
  const today = new Date();
  const dateKey = (days: number) => {
    const value = new Date(today);
    value.setDate(today.getDate() + days);
    return localDateKey(value);
  };

  const base = {
    cityId: defaultCityId,
    price: 0,
    visibility: "public" as const,
    urgent: false,
    popular: true,
  };

  const demoMember = { userKey: visualDemoUserKey, name: visualDemoUserName, status: "joined" as const };

  return [
    {
      ...base,
      id: "demo-volleyball",
      type: "sport",
      categoryId: "sport",
      activity: demoLocalized("Volleyball"),
      title: demoLocalized("Volleyball"),
      description: demoLocalized("Casual volleyball in Olomouc. Demo event for beta testing."),
      date: dateKey(1),
      time: "18:30",
      address: "ZS Demlova, Olomouc",
      locationUrl: "https://www.google.com/maps/search/?api=1&query=ZS%20Demlova%20Olomouc",
      participantNote: "Bring water and sport shoes.",
      capacity: 8,
      participants: 3,
      members: [demoMember, { userKey: "demo-maks", name: "Maks", status: "joined" }, { userKey: "demo-vita", name: "Vita", status: "joined" }],
      organizer: visualDemoUserName,
      organizerKey: visualDemoUserKey,
      metadata: { sport: { sportType: "Volleyball", level: "beginner", format: "casual", environment: "outdoor", equipmentNeeded: false, bring: "Water, sport shoes", durationMinutes: 90 } },
    },
    {
      ...base,
      id: "demo-board-games",
      type: "custom",
      categoryId: "social",
      activity: demoLocalized("Board games"),
      title: demoLocalized("Board games"),
      description: demoLocalized("Easy board games meetup in the city center."),
      date: dateKey(2),
      time: "17:00",
      address: "Horni namesti, Olomouc",
      locationUrl: "https://www.google.com/maps/search/?api=1&query=Horni%20namesti%20Olomouc",
      participantNote: "You can bring your own game.",
      capacity: 6,
      participants: 1,
      members: [demoMember],
      organizer: visualDemoUserName,
      organizerKey: visualDemoUserKey,
    },
    {
      ...base,
      id: "demo-running",
      type: "sport",
      categoryId: "sport",
      activity: demoLocalized("Running"),
      title: demoLocalized("Running"),
      description: demoLocalized("Light evening run. Beginner friendly."),
      date: dateKey(3),
      time: "19:00",
      address: "Smetanovy sady, Olomouc",
      locationUrl: "https://www.google.com/maps/search/?api=1&query=Smetanovy%20sady%20Olomouc",
      participantNote: "Slow pace. No pressure.",
      capacity: 10,
      participants: 1,
      members: [demoMember],
      organizer: visualDemoUserName,
      organizerKey: visualDemoUserKey,
      metadata: { sport: { sportType: "Running", level: "beginner", format: "training", environment: "outdoor", equipmentNeeded: false, bring: "Water", durationMinutes: 45 } },
    },
    {
      ...base,
      id: "demo-walking",
      type: "custom",
      categoryId: "social",
      activity: demoLocalized("Walking"),
      title: demoLocalized("Walking"),
      description: demoLocalized("Simple walk around Olomouc."),
      date: dateKey(4),
      time: "16:30",
      address: "Bezrucovy sady, Olomouc",
      locationUrl: "https://www.google.com/maps/search/?api=1&query=Bezrucovy%20sady%20Olomouc",
      participantNote: "Comfortable shoes recommended.",
      capacity: 8,
      participants: 1,
      members: [demoMember],
      organizer: visualDemoUserName,
      organizerKey: visualDemoUserKey,
    },
    {
      ...base,
      id: "demo-coffee-meetup",
      type: "custom",
      categoryId: "social",
      activity: demoLocalized("Coffee meetup"),
      title: demoLocalized("Coffee meetup"),
      description: demoLocalized("Coffee, small talk and meeting new people."),
      date: dateKey(5),
      time: "15:00",
      address: "Dolni namesti, Olomouc",
      locationUrl: "https://www.google.com/maps/search/?api=1&query=Dolni%20namesti%20Olomouc",
      participantNote: "Casual meetup.",
      capacity: 5,
      participants: 1,
      members: [demoMember],
      organizer: visualDemoUserName,
      organizerKey: visualDemoUserKey,
    },
    {
      ...base,
      id: "demo-language-exchange",
      type: "custom",
      categoryId: "language",
      activity: demoLocalized("Language exchange"),
      title: demoLocalized("Language exchange"),
      description: demoLocalized("Practice Czech, English, Ukrainian or Russian in a relaxed format."),
      date: dateKey(6),
      time: "18:00",
      address: "Univerzitni, Olomouc",
      locationUrl: "https://www.google.com/maps/search/?api=1&query=Univerzitni%20Olomouc",
      participantNote: "Any level is welcome.",
      capacity: 8,
      participants: 1,
      members: [demoMember],
      organizer: visualDemoUserName,
      organizerKey: visualDemoUserKey,
    },
  ];
};

const readDemoActivities = () => {
  const seeded = createSeedDemoActivities();
  const snapshot = reconcileVisualDemoSnapshot(
    localStorage.getItem(visualDemoStorageKey),
    seeded,
    new Date(),
    isActivityStillVisible,
  );
  localStorage.setItem(visualDemoStorageKey, JSON.stringify(snapshot));
  return snapshot.activities;
};

const writeDemoActivities = (activities: Activity[]) => {
  localStorage.setItem(visualDemoStorageKey, JSON.stringify({
    seededOn: localDateKey(),
    activities,
  }));
};

const syncDemoState = (setState: (state: Partial<AppState>) => void, activities: Activity[]) => {
  const visibleActivities = activities.filter(isActivityStillVisible);
  setState({
    activities: visibleActivities.map((activity) => ({
      ...activity,
      participants: activity.members.filter((member) => member.status === "joined").length,
    })),
    joinedIds: visibleActivities.filter((activity) => activity.members.some((member) => member.userKey === visualDemoUserKey && member.status === "joined")).map((activity) => activity.id),
    waitingIds: visibleActivities.filter((activity) => activity.members.some((member) => member.userKey === visualDemoUserKey && member.status === "waiting")).map((activity) => activity.id),
    pendingIds: visibleActivities.filter((activity) => activity.members.some((member) => member.userKey === visualDemoUserKey && member.status === "pending")).map((activity) => activity.id),
    syncError: null,
  });
};


const applyDemoActivities = (setState: (state: Partial<AppState>) => void, activities: Activity[], extra: Partial<AppState> = {}) => {
  writeDemoActivities(activities);
  syncDemoState(setState, activities);
  setState({ ...extra, syncError: visualDemoNotice });
};

class AuthNotReadyError extends Error {
  constructor() {
    super("Authentication is not ready yet");
    this.name = "AuthNotReadyError";
  }
}

const ensureTrustedAuthForWrite = async () => {
  let identity = getCurrentAuthIdentity();

  if (!isTrustedAuthReady() || !supportsTrustedCoreAccess(identity)) {
    identity = await initializeTrustedAuth();
  }

  if (!supportsTrustedCoreAccess(identity)) {
    throw new AuthNotReadyError();
  }

  await ensureFirstOnboardingComplete();
};

const localizedDbText = (ru: string, cs: string) => ({
  ru,
  uk: ru,
  cs,
  en: ru });

const normalizeCategoryId = (categoryId: string) => {
  if (categoryId === "inline-skating") return "activities";
  return categories.some((category) => category.id === categoryId) ? categoryId : "activities";
};

const inferActivityType = (categoryId: string, explicitType?: ActivityType | null): ActivityType =>
  explicitType || (normalizeCategoryId(categoryId) === "sport" ? "sport" : "custom");

const mapActivity = (row: DbActivity, members: DbMember[]): Activity => ({
  id: row.id,
  type: activityOverride(row.id).type || inferActivityType(row.category_id, row.activity_type),
  categoryId: normalizeCategoryId(row.category_id),
  activity: localizedDbText(row.activity_ru, row.activity_cs),
  title: localizedDbText(row.title_ru, row.title_cs),
  description: localizedDbText(row.description_ru, row.description_cs),
  date: row.event_date,
  time: row.event_time.slice(0, 5),
  cityId: activityCityId(row),
  address: row.address,
  locationUrl: row.location_url || undefined,
  participantNote: row.participant_note || activityOverride(row.id).participantNote || undefined,
  price: row.price,
  capacity: row.capacity,
  participants: members.filter((member) => member.activity_id === row.id && member.status === "joined").length,
  members: members
    .filter((member) => member.activity_id === row.id)
    .map((member) => ({ userKey: member.user_key, name: member.display_name, status: member.status })),
  organizer: row.organizer,
  organizerKey: row.organizer_key,
  visibility: row.visibility,
  urgent: row.urgent,
  popular: row.popular,
  metadata: row.metadata || activityOverride(row.id).metadata || undefined });

const isMissingOptionalColumnError = (error: { message?: string } | null) =>
  Boolean(error?.message?.includes("city_id") || error?.message?.includes("participant_note") || error?.message?.includes("activity_type") || error?.message?.includes("metadata"));

const optionalActivityColumns = ["city_id", "participant_note", "activity_type", "metadata"] as const;
type OptionalActivityColumn = (typeof optionalActivityColumns)[number];

const deletedActivityMarker = "__go_irl_deleted__";
const missingActivityColumns = new Set<OptionalActivityColumn>();
const activityOverrideStorageKey = "go-irl-activity-overrides";
const legacyCityOverrideStorageKey = "go-irl-activity-city-overrides";

type ActivityOverride = {
  cityId?: string;
  participantNote?: string;
  type?: ActivityType;
  metadata?: ActivityMetadata;
};

const readActivityOverrides = (): Record<string, ActivityOverride> => {
  try {
    return JSON.parse(localStorage.getItem(activityOverrideStorageKey) || "{}") as Record<string, ActivityOverride>;
  } catch {
    return {};
  }
};

const readLegacyCityOverrides = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(legacyCityOverrideStorageKey) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
};

const writeActivityOverride = (activityId: string, override: ActivityOverride) => {
  const overrides = readActivityOverrides();
  overrides[activityId] = { ...overrides[activityId], ...override };
  localStorage.setItem(activityOverrideStorageKey, JSON.stringify(overrides));
};

const removeActivityOverride = (activityId: string) => {
  const overrides = readActivityOverrides();
  delete overrides[activityId];
  localStorage.setItem(activityOverrideStorageKey, JSON.stringify(overrides));
};

const activityOverride = (activityId: string) => readActivityOverrides()[activityId] || {};
const activityCityId = (row: DbActivity) => row.city_id || activityOverride(row.id).cityId || readLegacyCityOverrides()[row.id] || defaultCityId;
const isDeletedActivityRow = (row: DbActivity) => row.title_ru === deletedActivityMarker || row.title_cs === deletedActivityMarker;

const withoutMissingOptionalColumn = <T extends Partial<Record<OptionalActivityColumn, unknown>>>(row: T, error: { message?: string } | null) => {
  const message = error?.message || "";
  const nextRow = { ...row };
  const missingColumns = optionalActivityColumns.filter((column) => message.includes(column));
  const columnsToRemove = missingColumns.length ? missingColumns : optionalActivityColumns;

  for (const column of columnsToRemove) {
    missingActivityColumns.add(column);
    delete nextRow[column];
  }

  return nextRow;
};

const optionalOverrideFromInput = (input: NewActivity): ActivityOverride => {
  const override: ActivityOverride = {};
  if (missingActivityColumns.has("city_id")) override.cityId = input.cityId;
  if (missingActivityColumns.has("participant_note")) override.participantNote = input.participantNote;
  if (missingActivityColumns.has("activity_type")) override.type = input.type || inferActivityType(input.categoryId);
  if (missingActivityColumns.has("metadata")) override.metadata = input.metadata;
  return override;
};

const hasActivityOverride = (override: ActivityOverride) => Object.values(override).some((value) => value !== undefined);

const activityFromInput = (id: string, input: NewActivity, current: Activity): Activity => {
  const localizedText = {
    ru: input.activityText,
    uk: input.activityText,
    cs: input.activityText,
    en: input.activityText };
  const localizedTitle = {
    ru: input.titleText,
    uk: input.titleText,
    cs: input.titleText,
    en: input.titleText };
  const localizedDescription = {
    ru: input.descriptionText,
    uk: input.descriptionText,
    cs: input.descriptionText,
    en: input.descriptionText };

  return {
    ...current,
    id,
    type: input.type || inferActivityType(input.categoryId),
    categoryId: normalizeCategoryId(input.categoryId),
    activity: localizedText,
    title: localizedTitle,
    description: localizedDescription,
    date: input.date,
    time: input.time,
    cityId: input.cityId,
    address: input.address,
    locationUrl: input.locationUrl,
    participantNote: input.participantNote,
    price: input.price,
    capacity: input.capacity,
    visibility: input.visibility,
    metadata: input.metadata };
};

export const useAppStore = create<AppState>((set, get) => {
  const reload = async () => {
    if (isVisualDemoMode()) {
      syncDemoState(set, readDemoActivities());
      return;
    }

    if (typeof document !== "undefined" && document.hidden) return;
    const userKey = getUserKey();
    const [activitiesResult, membersResult] = await Promise.all([
      supabase.from("activities").select("*").order("event_date").order("event_time"),
      supabase.from("activity_members").select("activity_id,user_key,display_name,status"),
    ]);

    const error = activitiesResult.error || membersResult.error;
    if (error) throw error;

    const rows = ((activitiesResult.data || []) as DbActivity[]).filter((row) => !isDeletedActivityRow(row));
    const members = (membersResult.data || []) as DbMember[];
    const externalEntryIntent = typeof window !== "undefined"
      ? resolveActivityEntryIntent(window.location)
      : null;
    const invitedActivityId = getCurrentStartParam()
      || externalEntryIntent?.activityId
      || (typeof window !== "undefined" ? activityIdFromJoinPath(window.location.pathname) : "");
    const visibleRows = rows.filter(isActivityStillVisible).filter((row) => row.visibility === "public" || row.organizer_key === userKey || row.id === invitedActivityId);
    const visibleMembers = members;

    set({
      activities: visibleRows.map((row) => mapActivity(row, visibleMembers)),
      joinedIds: members.filter((member) => member.user_key === userKey && member.status === "joined").map((member) => member.activity_id),
      waitingIds: members.filter((member) => member.user_key === userKey && member.status === "waiting").map((member) => member.activity_id),
      pendingIds: members.filter((member) => member.user_key === userKey && member.status === "pending").map((member) => member.activity_id),
      syncError: null });
  };

  return {
    language: ["ru", "uk", "cs", "en"].includes(localStorage.getItem("go-irl-language") || "")
      ? localStorage.getItem("go-irl-language") as Language
      : "ru",
    selectedCityId: cities.some((city) => city.id === localStorage.getItem("go-irl-city"))
      ? localStorage.getItem("go-irl-city")!
      : defaultCityId,
    view: "home",
    activities: [],
    joinedIds: [],
    waitingIds: [],
    pendingIds: [],
    selectedCategory: null,
    loading: true,
    syncError: null,
    userRole: resolveCurrentUserRole(),

    initialize: async () => {
      set({ loading: true });
      try {
        set({ userRole: resolveCurrentUserRole() });
        await reload();
        if (!isVisualDemoMode() && !realtimeChannel && !(typeof document !== "undefined" && document.hidden)) {
          realtimeChannel = supabase
            .channel("go-irl-live")
            .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
              if (!(typeof document !== "undefined" && document.hidden)) void reload();
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "activity_members" }, () => {
              if (!(typeof document !== "undefined" && document.hidden)) void reload();
            })
            .subscribe();
        }
      } catch (error) {
        console.error(error);
        set({ syncError: "database_unavailable" });
      } finally {
        set({ loading: false });
      }
    },

    disposeRealtime: () => {
      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    },

    setLanguage: (language) => {
      localStorage.setItem("go-irl-language", language);
      set({ language });
    },
    setSelectedCity: (selectedCityId) => {
      if (!cities.some((city) => city.id === selectedCityId)) return;
      localStorage.setItem("go-irl-city", selectedCityId);
      set({ selectedCityId });
    },
    setView: (view) => set({ view }),
    setCategory: (selectedCategory) => set({ selectedCategory, view: "explore" }),

    toggleJoin: async (id) => {
      if (isVisualDemoMode()) {
        const activities = readDemoActivities();
        const activity = activities.find((item) => item.id === id);
        if (!activity) throw new Error("Activity not found");

        const existing = activity.members.find((member) => member.userKey === visualDemoUserKey);
        if (existing) {
          activity.members = activity.members.filter((member) => member.userKey !== visualDemoUserKey);
          applyDemoActivities(set, activities);
          return "left";
        }

        if (activity.visibility === "private") return "private";
        if (activity.members.filter((member) => member.status === "joined").length >= activity.capacity) return "full";

        const status = activity.visibility === "invite" ? "pending" : "joined";
        activity.members.push({ userKey: visualDemoUserKey, name: visualDemoUserName, status });
        applyDemoActivities(set, activities);
        return status;
      }

      await ensureTrustedAuthForWrite();
      const userKey = getUserKey();
      const { joinedIds, waitingIds, pendingIds, activities } = get();

      if (joinedIds.includes(id) || waitingIds.includes(id) || pendingIds.includes(id)) {
        const { error } = await supabase.from("activity_members").delete().eq("activity_id", id).eq("user_key", userKey);
        if (error) throw error;
        await reload();
        return "left";
      }

      const activity = activities.find((item) => item.id === id);
      if (!activity) throw new Error("Activity not found");
      if (activity.visibility === "private") return "private";
      if (activity.participants >= activity.capacity) return "full";

      const status: DbMember["status"] = activity.visibility === "invite" ? "pending" : "joined";
      const displayName = getCurrentDisplayName(getTranslation(get().language).guestName);
      const { error } = await supabase.from("activity_members").insert({
        activity_id: id,
        user_key: userKey,
        display_name: displayName,
        status });
      if (error) throw error;
      await reload();
      return status;
    },

    createActivity: async (input) => {
      if (isVisualDemoMode()) {
        const activities = readDemoActivities();
        const id = `demo-${Date.now()}`;
        const activity = activityFromInput(id, input, {
          id,
          type: input.type || inferActivityType(input.categoryId),
          categoryId: normalizeCategoryId(input.categoryId),
          activity: demoLocalized(input.activityText),
          title: demoLocalized(input.titleText),
          description: demoLocalized(input.descriptionText),
          date: input.date,
          time: input.time,
          cityId: input.cityId,
          address: input.address,
          locationUrl: input.locationUrl,
          participantNote: input.participantNote,
          price: input.price,
          capacity: input.capacity,
          participants: 1,
          members: [{ userKey: visualDemoUserKey, name: visualDemoUserName, status: "joined" }],
          organizer: visualDemoUserName,
          organizerKey: visualDemoUserKey,
          visibility: input.visibility,
          urgent: false,
          popular: false,
          metadata: input.metadata,
        });
        activities.unshift(activity);
        applyDemoActivities(set, activities, { view: "home" });
        return id;
      }

      await ensureTrustedAuthForWrite();
      const userKey = getUserKey();
      const organizer = getCurrentDisplayName(getTranslation(get().language).guestName);
      const row = {
        category_id: input.categoryId,
        activity_ru: input.activityText,
        activity_cs: input.activityText,
        title_ru: input.titleText,
        title_cs: input.titleText,
        description_ru: input.descriptionText,
        description_cs: input.descriptionText,
        event_date: input.date,
        event_time: input.time,
        city_id: input.cityId,
        address: input.address,
        location_url: input.locationUrl || null,
        participant_note: input.participantNote || null,
        activity_type: input.type || inferActivityType(input.categoryId),
        metadata: input.metadata || null,
        price: input.price,
        capacity: input.capacity,
        organizer,
        organizer_key: userKey,
        visibility: input.visibility };

      let insertRow = row;
      let data = null as { id: string } | null;
      let error = null as { message?: string } | null;
      for (let attempt = 0; attempt <= optionalActivityColumns.length; attempt += 1) {
        const result = await supabase.from("activities").insert(insertRow).select("id").single();
        data = result.data;
        error = result.error;
        if (!isMissingOptionalColumnError(error)) break;
        insertRow = withoutMissingOptionalColumn(insertRow, error);
      }
      if (error) throw error;
      if (!data) throw new Error("Activity was not created");
      const override = optionalOverrideFromInput(input);
      if (hasActivityOverride(override)) {
        writeActivityOverride(data.id, override);
      } else {
        removeActivityOverride(data.id);
      }

      const { error: memberError } = await supabase.from("activity_members").insert({
        activity_id: data.id,
        user_key: userKey,
        display_name: organizer,
        status: "joined" });
      if (memberError) throw memberError;

      await reload();
      set({ view: "home" });
      return data.id as string;
    },

    updateActivity: async (id, input) => {
      if (isVisualDemoMode()) {
        const activities = readDemoActivities();
        const current = activities.find((item) => item.id === id);
        if (!current || current.organizerKey !== visualDemoUserKey) throw new Error("Only organizer can edit activity");

        const next = activities.map((activity) => activity.id === id ? activityFromInput(id, input, current) : activity);
        applyDemoActivities(set, next, { view: "home" });
        return id;
      }

      await ensureTrustedAuthForWrite();
      const userKey = getUserKey();
      const current = get().activities.find((item) => item.id === id);
      if (!current || current.organizerKey !== userKey) throw new Error("Only organizer can edit activity");

      const row = {
        category_id: input.categoryId,
        activity_ru: input.activityText,
        activity_cs: input.activityText,
        title_ru: input.titleText,
        title_cs: input.titleText,
        description_ru: input.descriptionText,
        description_cs: input.descriptionText,
        event_date: input.date,
        event_time: input.time,
        city_id: input.cityId,
        address: input.address,
        location_url: input.locationUrl || null,
        participant_note: input.participantNote || null,
        activity_type: input.type || inferActivityType(input.categoryId),
        metadata: input.metadata || null,
        price: input.price,
        capacity: input.capacity,
        visibility: input.visibility };

      let updateRow = row;
      let error = null as { message?: string } | null;
      let count = 0;
      for (let attempt = 0; attempt <= optionalActivityColumns.length; attempt += 1) {
        const result = await supabase.from("activities").update(updateRow, { count: "exact" }).eq("id", id);
        error = result.error;
        count = result.count ?? 0;
        if (!isMissingOptionalColumnError(error)) break;
        updateRow = withoutMissingOptionalColumn(updateRow, error);
      }
      if (error) throw error;
      if (count === 0) throw new Error("Activity was not updated");
      const override = optionalOverrideFromInput(input);
      if (hasActivityOverride(override)) {
        writeActivityOverride(id, override);
      } else {
        removeActivityOverride(id);
      }
      set((state) => ({
        activities: state.activities.map((activity) => (activity.id === id ? activityFromInput(id, input, current) : activity)) }));
      await reload();
      set({ view: "home" });
      return id;
    },

    deleteActivity: async (id) => {
      if (isVisualDemoMode()) {
        const activities = readDemoActivities();
        const current = activities.find((item) => item.id === id);
        if (!current || current.organizerKey !== visualDemoUserKey) throw new Error("Only organizer can delete activity");

        removeActivityOverride(id);
        applyDemoActivities(set, activities.filter((activity) => activity.id !== id), { view: "home" });
        return;
      }

      await ensureTrustedAuthForWrite();
      const userKey = getUserKey();
      const current = get().activities.find((item) => item.id === id);
      const isAdmin = getTrustedUserRole() === "admin" || isCurrentUserAdmin(userKey);
      if (!current || (current.organizerKey !== userKey && !isAdmin)) {
        throw new Error("Only organizer or admin can delete activity");
      }

      const { error, count } = await supabase.from("activities").delete({ count: "exact" }).eq("id", id);
      if (error) throw error;
      if (count === 0) {
        const fallback = await supabase
          .from("activities")
          .update({
            activity_ru: deletedActivityMarker,
            activity_cs: deletedActivityMarker,
            title_ru: deletedActivityMarker,
            title_cs: deletedActivityMarker,
            description_ru: deletedActivityMarker,
            description_cs: deletedActivityMarker,
            visibility: "private" }, { count: "exact" })
          .eq("id", id);
        if (fallback.error) throw fallback.error;
        if ((fallback.count ?? 0) === 0) throw new Error("Activity was not deleted");
      }
      removeActivityOverride(id);
      set((state) => ({
        activities: state.activities.filter((activity) => activity.id !== id),
        joinedIds: state.joinedIds.filter((activityId) => activityId !== id),
        waitingIds: state.waitingIds.filter((activityId) => activityId !== id),
        pendingIds: state.pendingIds.filter((activityId) => activityId !== id) }));
      await reload();
      set({ view: "home" });
    },

    reviewRequest: async (activityId, memberKey, approved) => {
      if (isVisualDemoMode()) {
        const activities = readDemoActivities();
        const activity = activities.find((item) => item.id === activityId);
        if (!activity || activity.organizerKey !== visualDemoUserKey) throw new Error("Only organizer can review requests");

        if (!approved) {
          activity.members = activity.members.filter((member) => member.userKey !== memberKey);
        } else {
          const status = activity.members.filter((member) => member.status === "joined").length >= activity.capacity ? "waiting" : "joined";
          activity.members = activity.members.map((member) => member.userKey === memberKey ? { ...member, status } : member);
        }

        applyDemoActivities(set, activities);
        return;
      }

      await ensureTrustedAuthForWrite();
      const activity = get().activities.find((item) => item.id === activityId);
      if (!activity || activity.organizerKey !== getUserKey()) throw new Error("Only organizer can review requests");
      const { error } = await supabase.rpc("go_irl_review_join_request", {
        p_activity_id: activityId,
        p_member_user_key: memberKey,
        p_approved: approved,
      });
      if (error) throw error;
      await reload();
    } };
});



function isActivityStillVisible(row: DbActivity | Activity) {
  const date = "event_date" in row ? row.event_date : row.date;
  const time = "event_time" in row ? row.event_time : row.time;
  const start = new Date(`${date}T${String(time || "00:00").slice(0, 5)}:00`).getTime();
  const meta = (row.metadata || {}) as { durationMinutes?: number; duration?: number };
  const duration = typeof meta.durationMinutes === "number" ? meta.durationMinutes : typeof meta.duration === "number" ? meta.duration : 120;
  return Number.isNaN(start) || Date.now() <= start + (duration + 60) * 60000;
}
