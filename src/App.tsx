import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from "react";
import {
  ArrowLeft,
  BellDot,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Compass,
  Dices,
  Bug,
  Camera,
  Home,
  MapPin,
  Ellipsis,
  Pencil,
  Copy,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Trash2,
  UserRoundCheck,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import { activityOptions, categories, closedBetaActivityOptions, closedBetaCategories } from "./data";
import { clientNavigationLabels, domainActionLabels, homeCategoriesForPath } from "./domainHomeCategories";
import { AppHeader } from "./components/AppHeader";
import { buildGoogleCalendarUrl } from "./calendar/googleCalendar";
import { openBugReport } from "./bugReport";
import { getCurrentAuthIdentity, getCurrentRoleInvitationResult, getCurrentStartParam, initializeTrustedAuth } from "./authSession";
import { cities, getCity } from "./config/cities";
import { getStoredUiLanguage, getTranslation, localeByLanguage, uiLanguageChangedEvent, type UiLanguage } from "./i18n";
import { formatEventTime } from "./eventTime";
import {
  applyDiscoverFilters,
  matchesActivityInterest,
  searchActivities,
  simpleRecommendationEngine,
  type DiscoverFilter,
} from "./recommendations";
import { useAppStore } from "./store";
import { getUserKey, supabase } from "./supabase";
import { closeMiniApp, expandMiniApp, getTelegramWebApp, impactTelegram, notifyTelegram, readyMiniApp, showBackButton } from "./telegram";
import type { Activity, AppView, Category, Language, NewActivity, SportEnvironment, SportFormat, SportLevel, SportMetadata } from "./types";
import {
  MAX_EVENT_ADDRESS_LENGTH,
  MAX_EVENT_CAPACITY,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_NOTE_LENGTH,
  MAX_EVENT_PRICE,
  MIN_EVENT_CAPACITY,
  validateEventCapacity,
  validateEventDate,
  validateEventPrice,
  validateMaxLength,
  validateOptionalUrl,
  validateRequiredText,
} from "./validation";
import { ActivityChatPanel } from "./components/ActivityChatPanel";
import { ensureActivityChat } from "./activityChatFeature";
import { EventCardMetaItem, EventDetailsAction, OrganizerAvatarAction, OrganizerDetailAction } from "./components/EventCardPrimitives";
import { getOrganizerRoleRequestState } from "./coachFeature";
import { CardShareAction } from "./components/CardShareAction";
import { CardReminderAction } from "./components/CardReminderAction";
import { EventCardArtwork } from "./components/EventCardArtwork";
import { ActivityIcon } from "./components/ActivityIcon";
import { stripLeadingEmoji } from "./cardText";
import { buildEventLocationUrl, loadSavedEventLocations, rememberEventLocation } from "./eventLocations";
import { resolveActivityMapNavigation } from "./activityMapNavigation";
import { requestMapProvider } from "./mapProviderPicker";
import { readUserPreferences } from "./userPreferences";
import { openAvatarCropper } from "./avatarCropper";
import { activityIconFor } from "./activityIcon";
import { buildActivityCopySeed, type ActivityCopySeed } from "./activityCopySeed";
import {
  MAX_WEEKLY_SERIES_OCCURRENCES,
  createActivitySeriesIdempotencyKey,
  resolveWeeklySeriesDates,
} from "./activitySeries";
import type { ActivitySeriesMutationScope } from "./activitySeriesMutation";
import {
  buildBrowserActivityInviteUrl,
  buildTelegramActivityInviteUrl,
  parseInvitationStartParam,
} from "./invitationLink";
import { EventWeatherStrip } from "./components/EventWeatherStrip";
import { isOutdoorGenericActivity } from "./eventWeather";
import { getEventSheetBackgroundStyle } from "./eventSheetBackground";
import { ServicesCatalogView, ServicesForYouView } from "./services/ServicesClientViews";
import { professionalCountLabel, professionalsForCity } from "./services/servicesProfessionalDirectory";
import { sharePreparedTelegramEvent } from "./telegramPreparedShare";
import {
  eventActionTranslationKey,
  eventStatusTranslationKey,
  isActivityFinished,
  resolveEventInteractionState,
  runEventPrimaryAction,
} from "./eventInteractionState";
import { isTabSwipeBlockedTarget, resolveAdjacentTab, resolveSwipeDirection } from "./bottom-nav-swipe";
import { isTemplateCarouselDrag } from "./templateCarousel";
import { createProfileRepository, type ProfileRepository } from "./profile/profileRepository";
import type { UserProfile, UserProfileDraft } from "./profile/profileTypes";
import type { ProfilePanelSection } from "./profile/profilePanelTypes";
import { ProfilePanel } from "./components/ProfilePanel";
import { ProfilePreferences } from "./components/ProfilePreferences";
import { isRoleInvitationStartParam } from "./admin/roleInvitations";
import { buildCanonicalActivityEntryPath, resolveActivityEntryIntent } from "./auth/activityEntryIntent";
import { createEventForumTopic } from "./telegramEventSupergroup";
import { publishAssistantContext } from "./assistant/assistantContext";


const telegramBotUsername = String(import.meta.env.VITE_GO_IRL_BOT_USERNAME || "GOirl_bot").replace(/^@/, "");
const telegramAppName = String(import.meta.env.VITE_GO_IRL_APP_NAME || "").replace(/^\//, "");

type ActivityOpenOptions = { focusChat?: boolean; focusRequests?: boolean };
type OpenActivity = (activity: Activity, options?: ActivityOpenOptions) => void;

const activityInviteUrl = (activity: Activity) => {
  return buildTelegramActivityInviteUrl(activity.id, telegramBotUsername, telegramAppName)
    || buildBrowserActivityInviteUrl(activity.id, window.location.origin);
};

const openActivityMap = (activity: Activity) => {
  const navigation = resolveActivityMapNavigation({ locationUrl: activity.locationUrl, address: activity.address, cityName: getCity(activity.cityId).name.en }, readUserPreferences().mapProvider);
  if (navigation.targetUrl) { window.open(navigation.targetUrl, "_blank", "noopener,noreferrer"); return; }
  requestMapProvider(navigation.sourceUrl);
};

const openActivityCalendar = (activity: Activity, language: Language) => {
  const url = buildGoogleCalendarUrl(activity, {
    language,
    eventUrl: activityInviteUrl(activity),
  });
  const webApp = getTelegramWebApp();
  if (webApp?.openLink) {
    webApp.openLink(url, { try_instant_view: false });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

const genericActivityAvatar = (activity: Activity, language: Language, fallback: string) => {
  return activityIconFor(activity, language, fallback || "✨");
};

const eventHelperCardCopy: Record<Language, { needed: string; requested: string; confirmed: string }> = {
  ru: { needed: "Нужен помощник", requested: "Помощник запрошен", confirmed: "Есть помощник" },
  uk: { needed: "Потрібен помічник", requested: "Помічника запитано", confirmed: "Є помічник" },
  cs: { needed: "Potřebujeme pomocníka", requested: "Pomocník vyžádán", confirmed: "Pomocník potvrzen" },
  en: { needed: "Helper needed", requested: "Helper requested", confirmed: "Helper confirmed" },
};

const LazySportActivityCard = lazy(() => import("./verticals/SportVertical").then((module) => ({ default: module.SportActivityCard })));
const LazySportActivitySheet = lazy(() => import("./verticals/SportVertical").then((module) => ({ default: module.SportActivitySheet })));
const LazySportCreateFields = lazy(() => import("./verticals/SportVertical").then((module) => ({ default: module.SportCreateFields })));

const dateLabel = (date: string, language: Language) =>
  new Intl.DateTimeFormat(localeByLanguage[language], {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00`));

const compactDateLabel = (date: string, language: Language) => {
  const t = getTranslation(language);
  const eventDate = new Date(`${date}T12:00:00`);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date === todayKey) return t.today;
  if (date === tomorrow.toISOString().slice(0, 10)) return t.tomorrow;

  return new Intl.DateTimeFormat(localeByLanguage[language], {
    day: "numeric",
    month: "short",
  }).format(eventDate);
};

const fallbackCategory: Category = {
  id: "custom",
  icon: "✨",
  name: { ru: "Событие", uk: "Подія", cs: "Událost", en: "Event" },
};

const getActivityCategory = (activity: Activity) =>
  categories.find((item) => item.id === activity.categoryId) || fallbackCategory;

const isSportExperience = (activity: Activity) => activity.type === "sport" || activity.categoryId === "sport";

const safeDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const favoriteActivityOptions = (language: Language) => {
  const t = getTranslation(language);
  return [
    { id: "coffee", label: t.templateCoffee },
    { id: "walks", label: t.templateWalk },
    { id: "skating", label: t.templateSkating },
    { id: "cycling", label: t.favoriteCycling },
    { id: "running", label: t.favoriteRunning },
    { id: "hiking", label: t.favoriteHiking },
    { id: "board-games", label: t.templateBoardGames },
    { id: "football", label: t.favoriteFootball },
    { id: "tennis", label: t.favoriteTennis },
    { id: "volleyball", label: t.favoriteVolleyball },
    { id: "basketball", label: t.favoriteBasketball },
    { id: "swimming", label: t.favoriteSwimming },
    { id: "yoga", label: t.favoriteYoga },
    { id: "fitness", label: t.favoriteFitness },
    { id: "concerts", label: t.favoriteConcerts },
    { id: "cinema", label: t.favoriteCinema },
    { id: "food", label: t.templateFood },
    { id: "language-exchange", label: t.favoriteLanguageExchange },
    { id: "other", label: t.templateOther },
  ];
};

const sportMetadataFromForm = (data: FormData, sportType: string): SportMetadata => ({
  sportType,
  level: String(data.get("sportLevel") || "intermediate") as SportLevel,
  format: String(data.get("sportFormat") || "casual") as SportFormat,
  environment: String(data.get("sportEnvironment") || "outdoor") as SportEnvironment,
  equipmentNeeded: data.get("sportEquipmentNeeded") === "on",
  equipment: String(data.get("sportEquipment") || "").trim(),
  bring: String(data.get("sportBring") || "").trim(),
  requirements: String(data.get("sportRequirements") || "").trim(),
  organizerTips: String(data.get("sportOrganizerTips") || "").trim(),
  durationMinutes: Number(data.get("sportDuration") || 90),
});

function App() {
  const store = useAppStore();
  const [selected, setSelected] = useState<Activity | null>(null);
  const [selectedMembersOpen, setSelectedMembersOpen] = useState(false);
  const [selectedChatRequest, setSelectedChatRequest] = useState(0);
  const [focusedInviteActivityId, setFocusedInviteActivityId] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editingSeriesScope, setEditingSeriesScope] = useState<ActivitySeriesMutationScope | null>(null);
  const [seriesScopeDialog, setSeriesScopeDialog] = useState<{ action: "edit" | "cancel"; activity: Activity } | null>(null);
  const [seriesMutationBusy, setSeriesMutationBusy] = useState(false);
  const [copyingActivity, setCopyingActivity] = useState<Activity | null>(null);
  const [completion, setCompletion] = useState("");
  const [completionActivityId, setCompletionActivityId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const toastTimer = useRef<number | null>(null);
  const showNotice = (msg: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setNotice(msg);
    toastTimer.current = window.setTimeout(() => setNotice(""), 2200);
  };
  const invitationHandled = useRef(false);
  const tabSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const t = getTranslation(store.language);
  const openActivity: OpenActivity = (activity, options) => {
    setSelected(activity);
    setSelectedMembersOpen(Boolean(options?.focusRequests));
    setSelectedChatRequest(options?.focusChat ? (request) => request + 1 : 0);
  };

  useEffect(() => {
    const currentActivity = editingActivity ?? copyingActivity ?? selected;
    const formMode = editingActivity ? "edit" : copyingActivity ? "copy" : store.view === "create" ? "create" : "";
    const screen = editingActivity
      ? "activity-edit"
      : copyingActivity
        ? "activity-copy"
        : store.view === "create"
          ? "activity-create"
          : selected
            ? "activity-details"
            : store.view;
    publishAssistantContext({
      currentRoute: window.location.pathname,
      activeTab: store.view,
      screen,
      entityType: currentActivity || store.view === "create" ? "activity" : "",
      entityId: currentActivity?.id || "",
      selectedItemId: currentActivity?.id || "",
      userRole: store.userRole === "admin" || store.userRole === "superadmin"
        ? "admin"
        : store.userRole === "organizer"
          ? "organizer"
          : "unknown",
      formMode,
      validationErrors: [],
      platform: window.Telegram?.WebApp ? "telegram" : "web",
      uiLocale: store.language,
    });
  }, [copyingActivity, editingActivity, selected, store.language, store.userRole, store.view]);

  useEffect(() => {
    if (!completionActivityId) return;
    const activity = store.activities.find((item) => item.id === completionActivityId);
    if (!activity || selected?.id === activity.id) return;
    store.setView("home");
    openActivity(activity);
  }, [completionActivityId, selected?.id, store.activities]);

  useEffect(() => {
  readyMiniApp();
  expandMiniApp();
  const init = async () => {
    await initializeTrustedAuth();
    await useAppStore.getState().initialize();
  };
  init();

  const handleVisibility = () => {
    if (document.hidden) {
      useAppStore.getState().disposeRealtime();
    } else {
      void (async () => {
        await initializeTrustedAuth();
        await useAppStore.getState().initialize();
      })();
    }
  };

  window.addEventListener("focus", handleVisibility);
  window.addEventListener("blur", handleVisibility);
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    window.removeEventListener("focus", handleVisibility);
    window.removeEventListener("blur", handleVisibility);
    document.removeEventListener("visibilitychange", handleVisibility);
    useAppStore.getState().disposeRealtime();
  };
}, []);

  useEffect(() => {
    if (selected || store.view !== "home") {
      return showBackButton(() => {
        if (selected) {
          setSelected(null);
          setSelectedChatRequest(0);
        }
        else store.setView("home");
      });
    }
    return undefined;
  }, [selected, store.view, store]);

  useEffect(() => {
    if (invitationHandled.current) return;
    const startParam = getCurrentStartParam();
    if (isRoleInvitationStartParam(startParam)) {
      invitationHandled.current = true;
      void initializeTrustedAuth().then(() => {
        const result = getCurrentRoleInvitationResult();
        if (result?.status === "accepted") {
          showNotice(result.targetRole === "professional" ? t.roleInvitationProfessionalAccepted : t.roleInvitationOrganizerAccepted);
          notifyTelegram("success");
          return;
        }
        showNotice(result?.status === "role_conflict" ? t.roleInvitationConflict : t.roleInvitationInvalid);
        notifyTelegram("error");
      });
      return;
    }
    const activityEntryIntent = resolveActivityEntryIntent(window.location);
    const pathId = activityEntryIntent?.activityId || "";
    const parsedStartParam = startParam ? parseInvitationStartParam(startParam) : null;
    if (parsedStartParam && !parsedStartParam.valid) {
      invitationHandled.current = true;
      showNotice(t.invalidInvitationLink);
      return;
    }
    const invitedId = parsedStartParam?.eventId || pathId;
    if (invitedId) {
      const invitedActivity = store.activities.find((item) => item.id === invitedId);
      if (invitedActivity) {
        invitationHandled.current = true;
        setSelected(null);
        setSelectedMembersOpen(false);
        setSelectedChatRequest(0);
        setFocusedInviteActivityId(invitedActivity.id);
        store.setSelectedCity(invitedActivity.cityId);
        store.setView("discover");
        if (activityEntryIntent?.route === "join") {
          window.history.replaceState(
            {},
            "",
            buildCanonicalActivityEntryPath(activityEntryIntent, window.location.search),
          );
        }
      } else if (!store.loading) {
        invitationHandled.current = true;
        showNotice(t.invitationEventNotFound);
      }
    }
  }, [
    store.activities,
    store.language,
    store.loading,
    t.invalidInvitationLink,
    t.invitationEventNotFound,
    t.roleInvitationConflict,
    t.roleInvitationInvalid,
    t.roleInvitationOrganizerAccepted,
    t.roleInvitationProfessionalAccepted,
  ]);

  useEffect(() => {
    if (store.view !== "discover" && focusedInviteActivityId) {
      setFocusedInviteActivityId(null);
    }
  }, [focusedInviteActivityId, store.view]);

  const flash = (message: string) => {
    setNotice(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setNotice(""), 2200);
  };

  const requestCloseMiniApp = () => {
    if (!closeMiniApp()) flash(t.telegramCloseFallback);
  };

  const handleTabTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    if (isTabSwipeBlockedTarget(event.target)) {
      tabSwipeStart.current = null;
      return;
    }
    const touch = event.touches[0];
    tabSwipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTabTouchEnd = (event: ReactTouchEvent<HTMLElement>) => {
    const start = tabSwipeStart.current;
    tabSwipeStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const direction = resolveSwipeDirection(touch.clientX - start.x, touch.clientY - start.y);
    if (!direction) return;
    const nextView = resolveAdjacentTab(store.view, direction);
    if (nextView !== store.view) {
      setFocusedInviteActivityId(null);
      store.setView(nextView);
      impactTelegram("light");
    }
  };

  const handleJoin = async (activity: Activity) => {
    try {
      const result = await store.toggleJoin(activity.id);
      if (result === "left") {
        setSelected(null);
        setSelectedMembersOpen(false);
        setSelectedChatRequest(0);
        store.setView("home");
      }
      const message = result === "joined"
        ? t.joined
        : result === "pending"
          ? t.requested
          : result === "full"
            ? t.eventFull
            : result === "private"
              ? t.privateJoinInfo
              : t.leave;
      flash(message);
      notifyTelegram(result === "left" || result === "full" || result === "private" ? "warning" : "success");
    } catch {
      flash(t.joinError);
    }
  };

  const beginActivityEdit = (activity: Activity, scope: ActivitySeriesMutationScope | null = null) => {
    setSelected(null);
    setSelectedMembersOpen(false);
    setCopyingActivity(null);
    setEditingSeriesScope(scope);
    setEditingActivity(activity);
    store.setView("create");
  };

  const chooseSeriesMutationScope = async (scope: ActivitySeriesMutationScope) => {
    const request = seriesScopeDialog;
    if (!request || seriesMutationBusy) return;
    if (request.action === "edit") {
      setSeriesScopeDialog(null);
      beginActivityEdit(request.activity, scope);
      return;
    }

    setSeriesMutationBusy(true);
    try {
      await store.cancelActivitySeriesOccurrence(request.activity.id, scope);
      setSeriesScopeDialog(null);
      setSelected(null);
      setSelectedMembersOpen(false);
      setSelectedChatRequest(0);
      flash(seriesMutationCopy[store.language].cancelled);
      notifyTelegram("success");
    } catch {
      flash(t.deleteError);
      notifyTelegram("error");
    } finally {
      setSeriesMutationBusy(false);
    }
  };

  const handleDelete = async (activity: Activity) => {
    if (activity.seriesId && activity.organizerKey === getUserKey()) {
      setSeriesScopeDialog({ action: "cancel", activity });
      return;
    }

    const confirmed = window.confirm(`${t.deleteEventTitle}\n\n${t.deleteEventWarning}`);
    if (!confirmed) return;

    try {
      await store.deleteActivity(activity.id);
      setSelected(null);
      setSelectedChatRequest(0);
      flash(t.eventDeleted);
      notifyTelegram("success");
    } catch {
      flash(t.deleteError);
      notifyTelegram("error");
    }
  };

  const saveToGoogleCalendar = (activity: Activity) => {
    const url = buildGoogleCalendarUrl(activity, {
      language: store.language,
      eventUrl: activityInviteUrl(activity),
    });
    const webApp = getTelegramWebApp();
    if (webApp?.openLink) {
      webApp.openLink(url, { try_instant_view: false });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const normalizedAppPath = window.location.pathname.replace(/\/+$/, "");
  const isServicesDomain = normalizedAppPath === "/services" || /^\/beauty\/[^/]+(?:\/(?:ru|uk|cs|en))?$/i.test(normalizedAppPath);
  const setAppView = (view: AppView) => {
    if (view !== "discover") setFocusedInviteActivityId(null);
    store.setView(view);
  };

  return (
    <div className="app">
      <AppHeader
        language={store.language}
        selectedCityId={store.selectedCityId}
        translation={t}
        onBrandClick={() => {
          setFocusedInviteActivityId(null);
          setSelected(null);
          setSelectedMembersOpen(false);
          setSelectedChatRequest(0);
          store.setView("home");
          window.history.pushState(null, "", "/");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        onCityChange={(cityId) => {
          setFocusedInviteActivityId(null);
          store.setSelectedCity(cityId);
        }}
        onLanguageChange={store.setLanguage}
      />

      <main onTouchStart={handleTabTouchStart} onTouchEnd={handleTabTouchEnd}>
        {store.syncError && <div className="sync-banner">{store.syncError === "database_unavailable" ? t.databaseError : store.syncError}</div>}
        {store.loading && <div className="sync-loading">{t.loadingEvents}</div>}
        {store.view === "home" && (
          <HomeView
            language={store.language}
            onOpen={openActivity}
            onJoin={handleJoin}
          />
        )}
        {store.view === "discover" && (isServicesDomain
          ? <ServicesForYouView language={store.language} selectedCityId={store.selectedCityId} />
          : <DiscoverView language={store.language} onOpen={openActivity} onJoin={handleJoin} focusedActivityId={focusedInviteActivityId} />)}
        {store.view === "explore" && (isServicesDomain
          ? <ServicesCatalogView language={store.language} selectedCityId={store.selectedCityId} />
          : <ExploreView language={store.language} onOpen={openActivity} onJoin={handleJoin} />)}
        {store.view === "bookings" && <BookingsView language={store.language} onOpen={openActivity} onJoin={handleJoin} />}
        {store.view === "create" && <CreateView key={editingActivity ? `edit-${editingActivity.id}` : copyingActivity ? `copy-${copyingActivity.id}` : "new-event"} language={store.language} initialActivity={editingActivity} seriesEditScope={editingSeriesScope} copySeed={copyingActivity ? buildActivityCopySeed(copyingActivity) : null} onCancel={() => {
          setEditingActivity(null);
          setEditingSeriesScope(null);
          setCopyingActivity(null);
          store.setView("home");
        }} onCreated={(id, setupFailures) => {
          const channelCopy = eventChannelCreateCopy[getStoredUiLanguage(store.language)];
          const message = setupFailures?.activityChat && setupFailures.telegramTopic
            ? channelCopy.bothSetupFailed
            : setupFailures?.activityChat
              ? channelCopy.activityChatSetupFailed
              : setupFailures?.telegramTopic
                ? channelCopy.telegramTopicSetupFailed
                : editingActivity ? t.updatedSuccess : t.createdSuccess;
          flash(message);
          setEditingActivity(null);
          setEditingSeriesScope(null);
          setCopyingActivity(null);
          setCompletionActivityId(id);
          setCompletion(message);
        }} />}
        {store.view === "profile" && <ProfileView language={store.language} onOpen={openActivity} onJoin={handleJoin} onCloseMiniApp={requestCloseMiniApp} />}
      </main>

      <BottomNav view={store.view} setView={setAppView} language={store.language} />

      {selected && (
        <ActivitySheet
          activity={store.activities.find((item) => item.id === selected.id) || selected}
          language={store.language}
          cityName={getCity((store.activities.find((item) => item.id === selected.id) || selected).cityId).name[store.language]}
          loading={store.loading}
          error={store.syncError}
          onClose={() => {
            setSelected(null);
            setSelectedMembersOpen(false);
            setSelectedChatRequest(0);
            setCompletion("");
            setCompletionActivityId(null);
          }}
          onJoin={handleJoin}
          onCalendar={saveToGoogleCalendar}
          onEdit={(activity) => {
            if (activity.seriesId) {
              setSeriesScopeDialog({ action: "edit", activity });
              return;
            }
            beginActivityEdit(activity);
          }}
          onCopy={(activity) => {
            setSelected(null);
            setSelectedMembersOpen(false);
            setEditingActivity(null);
            setEditingSeriesScope(null);
            setCopyingActivity(activity);
            store.setView("create");
          }}
          onDelete={handleDelete}
          onCloseMiniApp={requestCloseMiniApp}
          onNotice={showNotice}
          initialMembersOpen={selectedMembersOpen}
          initialChatRequest={selectedChatRequest}
        />
      )}
      {seriesScopeDialog && (
        <SeriesScopeDialog
          language={store.language}
          action={seriesScopeDialog.action}
          busy={seriesMutationBusy}
          onChoose={(scope) => void chooseSeriesMutationScope(scope)}
          onClose={() => { if (!seriesMutationBusy) setSeriesScopeDialog(null); }}
        />
      )}
      {completion && selected?.id === completionActivityId && (
        <CompletionBar
          activity={store.activities.find((item) => item.id === completionActivityId) || selected}
          language={store.language}
          onCalendar={() => {
            const activity = useAppStore.getState().activities.find((item) => item.id === completionActivityId);
            setCompletion("");
            setCompletionActivityId(null);
            if (activity) saveToGoogleCalendar(activity);
          }}
          onCloseMiniApp={() => {
            setCompletion("");
            setCompletionActivityId(null);
            requestCloseMiniApp();
          }}
        />
      )}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function HomeView({ language, onOpen, onJoin }: { language: Language; onOpen: OpenActivity; onJoin: (activity: Activity) => void }) {
  const { activities, loading, selectedCityId, setCategory } = useAppStore();
  const t = getTranslation(language);
  const today = new Date().toISOString().slice(0, 10);
  const cityActivities = activities.filter((item) => item.cityId === selectedCityId);
  const nearby = cityActivities.filter((item) => item.date >= today).slice(0, 4);
  const popular = cityActivities.filter((item) => item.popular);
  const urgent = cityActivities.filter((item) => item.urgent);
  const homeCategories = homeCategoriesForPath(window.location.pathname, language);
  const servicesDomain = window.location.pathname.replace(/\/+$/, "") === "/services";
  const professionalCount = servicesDomain ? professionalsForCity(selectedCityId).length : 0;

  return (
    <>
      <div className={homeCategories.length === 1 ? "category-grid module-grid services-category-grid" : "category-grid module-grid"}>
        {homeCategories.map((category) => (
          <button className="category-button" data-category={category.id} key={category.id} onClick={() => setCategory(category.id)} type="button">
            <span>{category.icon}</span>
            <strong>{category.name[language]}</strong>
            <small>{servicesDomain ? professionalCount + " " + professionalCountLabel(language, professionalCount) : cityActivities.filter((activity) => activity.categoryId === category.id).length + " " + t.eventCountLabel}</small>
          </button>
        ))}
      </div>

      {loading ? <EventListSkeleton /> : nearby.length ? <ActivitySection title={t.nearby} activities={nearby} language={language} onOpen={onOpen} onJoin={onJoin} /> : <EmptyState text={t.noEvents} />}
      {urgent.length > 0 && <ActivitySection title={t.urgent} icon={<Zap size={18} />} activities={urgent} language={language} onOpen={onOpen} onJoin={onJoin} urgent />}
      <ActivitySection title={t.popular} activities={popular} language={language} onOpen={onOpen} onJoin={onJoin} />
    </>
  );
}

function BookingsView({ language, onOpen, onJoin }: { language: Language; onOpen: OpenActivity; onJoin: (activity: Activity) => void }) {
  const { activities, joinedIds, waitingIds, pendingIds } = useAppStore();
  const serviceDomain = window.location.pathname.replace(/\/+$/, "") === "/services";
  const relevantIds = new Set([...joinedIds, ...waitingIds, ...pendingIds]);
  const bookings = activities.filter((activity) => relevantIds.has(activity.id) && (!serviceDomain || activity.categoryId === "creativity"));
  const title = clientNavigationLabels[language][3];

  return (
    <section>
      <SectionHeader title={title} icon={<CalendarDays />} />
      {bookings.length
        ? <ActivitySection title={title} activities={bookings} language={language} onOpen={onOpen} onJoin={onJoin} />
        : <EmptyState text={language === "ru" ? "У вас пока нет записей" : language === "uk" ? "У вас поки немає записів" : language === "cs" ? "Zatím nemáte žádné rezervace" : "You have no bookings yet"} />}
    </section>
  );
}

function DiscoverView({ language, onOpen, onJoin, focusedActivityId }: { language: Language; onOpen: OpenActivity; onJoin: (activity: Activity) => void; focusedActivityId?: string | null }) {
  const { activities, loading, selectedCityId } = useAppStore();
  const t = getTranslation(language);
  const [locationState, setLocationState] = useState<"idle" | "ready" | "blocked">("idle");
  const focusedScrollHandled = useRef<string | null>(null);
  const profile = useMemo(() => loadProfile(t.guestName, selectedCityId), [selectedCityId, t.guestName]);
  const favoriteTerms = profile.favoriteActivities;
  const now = useMemo(() => new Date(), []);
  const city = getCity(selectedCityId);
  const cityActivities = activities.filter((activity) => activity.cityId === selectedCityId);
  const baseRecommended = simpleRecommendationEngine.recommend(cityActivities, {
    cityId: selectedCityId,
    favoriteActivities: favoriteTerms,
    language,
    now,
  });
  const focusedActivity = focusedActivityId ? activities.find((activity) => activity.id === focusedActivityId) || null : null;
  const recommended = focusedActivity
    ? [focusedActivity, ...baseRecommended.filter((activity) => activity.id !== focusedActivity.id)]
    : baseRecommended;
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  const weekLimit = new Date(now);
  weekLimit.setDate(now.getDate() + 7);
  const weekLimitDate = weekLimit.toISOString().slice(0, 10);
  const nearby = recommended.filter((activity) => activity.cityId === city.id).slice(0, 8);
  const interestMatches = favoriteTerms.length
    ? recommended.filter((activity) => matchesActivityInterest(activity, favoriteTerms, language)).slice(0, 8)
    : recommended.slice(0, 4);

  useEffect(() => {
    if (!focusedActivityId || loading || focusedScrollHandled.current === focusedActivityId) return;
    const frame = window.requestAnimationFrame(() => {
      const marker = Array.from(document.querySelectorAll<HTMLElement>(".discover-page [data-activity-id]"))
        .find((element) => element.dataset.activityId === focusedActivityId);
      const card = marker?.closest<HTMLElement>("article.unified-event-card");
      if (!card) return;
      card.scrollIntoView({ block: "center", inline: "center" });
      focusedScrollHandled.current = focusedActivityId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedActivityId, loading, recommended.length]);

  const enableLocation = () => {
    if (!navigator.geolocation) {
      setLocationState("blocked");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setLocationState("ready"),
      () => setLocationState("blocked"),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 5000 },
    );
  };

  return (
    <section className="page-section discover-page">
      <div className="page-title"><Sparkles /><div><h1>{t.forYou}</h1><p>{t.discoverSubtitle}</p></div></div>
      {loading ? (
        <EventListSkeleton />
      ) : (
        <>
          <DiscoverSection title={t.byInterestsSection} activities={interestMatches} language={language} onOpen={onOpen} onJoin={onJoin} />
          <DiscoverSection title={t.nearestEvents} activities={recommended.slice(0, 8)} language={language} onOpen={onOpen} onJoin={onJoin} />
          <DiscoverSection title={t.popularEvents} activities={recommended.filter((activity) => activity.popular).slice(0, 8)} language={language} onOpen={onOpen} onJoin={onJoin} />
          <DiscoverSection title={t.newEvents} activities={[...recommended].reverse().slice(0, 8)} language={language} onOpen={onOpen} onJoin={onJoin} />
          <DiscoverSection title={t.todaySection} activities={recommended.filter((activity) => activity.date === today)} language={language} onOpen={onOpen} onJoin={onJoin} />
          <DiscoverSection title={t.tomorrowSection} activities={recommended.filter((activity) => activity.date === tomorrowDate)} language={language} onOpen={onOpen} onJoin={onJoin} />
          <DiscoverSection title={t.thisWeekSection} activities={recommended.filter((activity) => activity.date >= today && activity.date <= weekLimitDate).slice(0, 8)} language={language} onOpen={onOpen} onJoin={onJoin} />
          <section className="discover-section">
            <div className="section-title discover-section-title">
              <MapPin />
              <h2>{t.nearMeSection}</h2>
              {locationState === "idle" && <button onClick={enableLocation} type="button">{t.enableLocation}</button>}
            </div>
            {locationState === "blocked" && <div className="nearby-note">{t.nearMeUnavailable}</div>}
            <div className="horizontal-events">
              {nearby.length ? nearby.map((activity) => <DiscoverActivityCard key={activity.id} activity={activity} language={language} onOpen={onOpen} onJoin={onJoin} />) : <EmptyState text={t.noEvents} />}
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function DiscoverSection({ title, activities, language, onOpen, onJoin }: { title: string; activities: Activity[]; language: Language; onOpen: OpenActivity; onJoin: (activity: Activity) => void }) {
  if (!activities.length) return null;
  return (
    <section className="discover-section">
      <SectionHeader title={title} />
      <div className="horizontal-events">
        {activities.map((activity) => <DiscoverActivityCard key={activity.id} activity={activity} language={language} onOpen={onOpen} onJoin={onJoin} />)}
      </div>
    </section>
  );
}

function DiscoverActivityCard({ activity, language, onOpen, onJoin }: { activity: Activity; language: Language; onOpen: OpenActivity; onJoin: (activity: Activity) => void }) {
  return <ActivityCard activity={activity} language={language} onOpen={onOpen} onJoin={onJoin} showWeather />;
}

function ExploreView({ language, onOpen, onJoin }: { language: Language; onOpen: OpenActivity; onJoin: (activity: Activity) => void }) {
  const { activities, loading, selectedCategory, selectedCityId, setCategory } = useAppStore();
  const t = getTranslation(language);
  const city = getCity(selectedCityId);
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<DiscoverFilter[]>([]);
  const now = useMemo(() => new Date(), []);
  const cityActivities = activities.filter((item) => item.cityId === selectedCityId);
  const categoryActivities = selectedCategory ? cityActivities.filter((item) => item.categoryId === selectedCategory) : cityActivities;
  const filtered = applyDiscoverFilters(searchActivities(categoryActivities, query, language), activeFilters, language, now);
  const filterOptions: Array<{ id: DiscoverFilter; label: string }> = [
    { id: "today", label: t.today },
    { id: "tomorrow", label: t.tomorrow },
    { id: "weekend", label: t.weekend },
    { id: "free", label: t.free },
    { id: "up-to-200", label: t.upTo200 },
    { id: "beginners", label: t.beginners },
    { id: "public-only", label: t.publicOnly },
  ];
  const toggleFilter = (filter: DiscoverFilter) => {
    setActiveFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]);
  };

  return (
    <section className="page-section discover-page">
      <div className="page-title"><Compass /><div><h1>{t.all}</h1><p>{city.name[language]}</p></div></div>
      <label className="discover-search">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} />
      </label>
      <div className="filter-row">
        <button className={!selectedCategory ? "filter active" : "filter"} onClick={() => setCategory(null)} type="button">{t.all}</button>
        {categories.map((category) => (
          <button className={selectedCategory === category.id ? "filter active" : "filter"} key={category.id} onClick={() => setCategory(category.id)} type="button">
            {category.icon} {category.name[language]}
          </button>
        ))}
      </div>
      <div className="discover-filter-block">
        <span>{t.quickFilters}</span>
        <div className="filter-row discover-filters">
          {filterOptions.map((filter) => (
            <button className={activeFilters.includes(filter.id) ? "filter active" : "filter"} key={filter.id} onClick={() => toggleFilter(filter.id)} type="button">
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      <div className="activity-stack">
        {loading ? <EventListSkeleton /> : filtered.length ? filtered.map((item) => <ActivityCard key={item.id} activity={item} language={language} onOpen={onOpen} onJoin={onJoin} />) : <EmptyState text={t.noEvents} />}
      </div>
    </section>
  );
}

const weeklyActivitySeriesCopy: Record<Language, {
  legend: string;
  none: string;
  weekly: string;
  boundaryLegend: string;
  untilDate: string;
  occurrenceCount: string;
  invalidBoundary: string;
  telegramFirstOnly: string;
}> = {
  ru: {
    legend: "Повторение",
    none: "Не повторять",
    weekly: "Каждую неделю",
    boundaryLegend: "Когда закончить",
    untilDate: "По дате",
    occurrenceCount: "После количества событий",
    invalidBoundary: "Укажите корректную дату окончания или количество событий от 1 до 104.",
    telegramFirstOnly: "Telegram-тема автоматически создаётся только для первого события серии. Остальные события можно привязать отдельно.",
  },
  uk: {
    legend: "Повторення",
    none: "Не повторювати",
    weekly: "Щотижня",
    boundaryLegend: "Коли завершити",
    untilDate: "За датою",
    occurrenceCount: "Після кількості подій",
    invalidBoundary: "Вкажіть коректну дату завершення або кількість подій від 1 до 104.",
    telegramFirstOnly: "Telegram-тема автоматично створюється лише для першої події серії. Інші події можна прив'язати окремо.",
  },
  cs: {
    legend: "Opakování",
    none: "Neopakovat",
    weekly: "Každý týden",
    boundaryLegend: "Kdy skončit",
    untilDate: "Podle data",
    occurrenceCount: "Po počtu událostí",
    invalidBoundary: "Zadejte platné datum ukončení nebo počet událostí od 1 do 104.",
    telegramFirstOnly: "Telegram téma se automaticky vytvoří jen pro první událost série. Ostatní události lze připojit samostatně.",
  },
  en: {
    legend: "Repeat",
    none: "Do not repeat",
    weekly: "Every week",
    boundaryLegend: "When to end",
    untilDate: "By date",
    occurrenceCount: "After number of events",
    invalidBoundary: "Enter a valid end date or an event count from 1 to 104.",
    telegramFirstOnly: "A Telegram topic is created automatically only for the first event in the series. Other events can be linked separately.",
  },
};

const seriesMutationCopy: Record<Language, {
  editTitle: string;
  cancelTitle: string;
  hint: string;
  single: string;
  following: string;
  cancelled: string;
}> = {
  ru: { editTitle: "Что изменить?", cancelTitle: "Что отменить?", hint: "Выберите область изменений в серии.", single: "Только это событие", following: "Это и следующие", cancelled: "Событие отменено" },
  uk: { editTitle: "Що змінити?", cancelTitle: "Що скасувати?", hint: "Оберіть область змін у серії.", single: "Тільки цю подію", following: "Цю та наступні", cancelled: "Подію скасовано" },
  cs: { editTitle: "Co změnit?", cancelTitle: "Co zrušit?", hint: "Vyberte rozsah změny v sérii.", single: "Pouze tuto událost", following: "Tuto a následující", cancelled: "Událost byla zrušena" },
  en: { editTitle: "What should change?", cancelTitle: "What should be cancelled?", hint: "Choose the scope within the series.", single: "Only this event", following: "This and following", cancelled: "Event cancelled" },
};

type EventChannelSetupFailures = {
  activityChat: boolean;
  telegramTopic: boolean;
};

const eventChannelCreateCopy: Record<UiLanguage, {
  activityChatLegend: string;
  telegramTopicLegend: string;
  yes: string;
  no: string;
  activityChatRequired: string;
  telegramTopicRequired: string;
  activityChatSetupFailed: string;
  telegramTopicSetupFailed: string;
  bothSetupFailed: string;
  firstOccurrenceOnly: string;
}> = {
  ru: {
    activityChatLegend: "Создать чат GO IRL для события?",
    telegramTopicLegend: "Создать Telegram-топик для события?",
    yes: "Да",
    no: "Нет",
    activityChatRequired: "Выберите, создавать ли чат GO IRL для события",
    telegramTopicRequired: "Выберите, создавать ли Telegram-топик для события",
    activityChatSetupFailed: "Событие создано, но чат GO IRL создать не удалось. Его можно создать из карточки события.",
    telegramTopicSetupFailed: "Событие создано, но Telegram-топик создать не удалось. Его можно создать из карточки события.",
    bothSetupFailed: "Событие создано, но чат GO IRL и Telegram-топик создать не удалось. Их можно создать из карточки события.",
    firstOccurrenceOnly: "Для серии выбранные каналы создаются только для первого события. Для остальных их можно включить отдельно.",
  },
  uk: {
    activityChatLegend: "Створити чат GO IRL для події?",
    telegramTopicLegend: "Створити Telegram-тему для події?",
    yes: "Так",
    no: "Ні",
    activityChatRequired: "Оберіть, чи створювати чат GO IRL для події",
    telegramTopicRequired: "Оберіть, чи створювати Telegram-тему для події",
    activityChatSetupFailed: "Подію створено, але чат GO IRL створити не вдалося. Його можна створити з картки події.",
    telegramTopicSetupFailed: "Подію створено, але Telegram-тему створити не вдалося. Її можна створити з картки події.",
    bothSetupFailed: "Подію створено, але чат GO IRL і Telegram-тему створити не вдалося. Їх можна створити з картки події.",
    firstOccurrenceOnly: "Для серії вибрані канали створюються лише для першої події. Для інших їх можна ввімкнути окремо.",
  },
  cs: {
    activityChatLegend: "Vytvořit chat GO IRL pro událost?",
    telegramTopicLegend: "Vytvořit Telegram téma pro událost?",
    yes: "Ano",
    no: "Ne",
    activityChatRequired: "Vyberte, zda se má pro událost vytvořit chat GO IRL",
    telegramTopicRequired: "Vyberte, zda se má pro událost vytvořit Telegram téma",
    activityChatSetupFailed: "Událost byla vytvořena, ale chat GO IRL se nepodařilo vytvořit. Lze ho vytvořit z karty události.",
    telegramTopicSetupFailed: "Událost byla vytvořena, ale Telegram téma se nepodařilo vytvořit. Lze ho vytvořit z karty události.",
    bothSetupFailed: "Událost byla vytvořena, ale chat GO IRL ani Telegram téma se nepodařilo vytvořit. Lze je vytvořit z karty události.",
    firstOccurrenceOnly: "U série se vybrané kanály vytvoří jen pro první událost. U dalších je lze zapnout samostatně.",
  },
  en: {
    activityChatLegend: "Create a GO IRL chat for this event?",
    telegramTopicLegend: "Create a Telegram topic for this event?",
    yes: "Yes",
    no: "No",
    activityChatRequired: "Choose whether to create a GO IRL chat for this event",
    telegramTopicRequired: "Choose whether to create a Telegram topic for this event",
    activityChatSetupFailed: "The event was created, but its GO IRL chat could not be created. You can create it from the event card.",
    telegramTopicSetupFailed: "The event was created, but its Telegram topic could not be created. You can create it from the event card.",
    bothSetupFailed: "The event was created, but its GO IRL chat and Telegram topic could not be created. You can create them from the event card.",
    firstOccurrenceOnly: "For a series, selected channels are created only for the first event. You can enable them separately for later events.",
  },
  pl: {
    activityChatLegend: "Utworzyć czat GO IRL dla tego wydarzenia?",
    telegramTopicLegend: "Utworzyć temat Telegram dla tego wydarzenia?",
    yes: "Tak",
    no: "Nie",
    activityChatRequired: "Wybierz, czy utworzyć czat GO IRL dla tego wydarzenia",
    telegramTopicRequired: "Wybierz, czy utworzyć temat Telegram dla tego wydarzenia",
    activityChatSetupFailed: "Wydarzenie utworzono, ale nie udało się utworzyć czatu GO IRL. Możesz utworzyć go z karty wydarzenia.",
    telegramTopicSetupFailed: "Wydarzenie utworzono, ale nie udało się utworzyć tematu Telegram. Możesz utworzyć go z karty wydarzenia.",
    bothSetupFailed: "Wydarzenie utworzono, ale nie udało się utworzyć czatu GO IRL ani tematu Telegram. Możesz utworzyć je z karty wydarzenia.",
    firstOccurrenceOnly: "Dla serii wybrane kanały są tworzone tylko dla pierwszego wydarzenia. Dla kolejnych możesz włączyć je osobno.",
  },
  sk: {
    activityChatLegend: "Vytvoriť chat GO IRL pre túto udalosť?",
    telegramTopicLegend: "Vytvoriť Telegram tému pre túto udalosť?",
    yes: "Áno",
    no: "Nie",
    activityChatRequired: "Vyber, či sa má pre túto udalosť vytvoriť chat GO IRL",
    telegramTopicRequired: "Vyber, či sa má pre túto udalosť vytvoriť Telegram téma",
    activityChatSetupFailed: "Udalosť bola vytvorená, ale chat GO IRL sa nepodarilo vytvoriť. Môžeš ho vytvoriť z karty udalosti.",
    telegramTopicSetupFailed: "Udalosť bola vytvorená, ale Telegram tému sa nepodarilo vytvoriť. Môžeš ju vytvoriť z karty udalosti.",
    bothSetupFailed: "Udalosť bola vytvorená, ale chat GO IRL ani Telegram tému sa nepodarilo vytvoriť. Môžeš ich vytvoriť z karty udalosti.",
    firstOccurrenceOnly: "Pri sérii sa vybrané kanály vytvoria iba pre prvú udalosť. Pri ďalších ich môžeš zapnúť samostatne.",
  },
};

function SeriesScopeDialog({ language, action, busy, onChoose, onClose }: { language: Language; action: "edit" | "cancel"; busy: boolean; onChoose: (scope: ActivitySeriesMutationScope) => void; onClose: () => void }) {
  const copy = seriesMutationCopy[language];
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <article className="activity-sheet" role="dialog" aria-modal="true" aria-label={action === "edit" ? copy.editTitle : copy.cancelTitle} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <button className="sheet-close" onClick={onClose} type="button" aria-label={getTranslation(language).close} disabled={busy}><X /></button>
        <div className="page-title"><CalendarDays /><div><h1>{action === "edit" ? copy.editTitle : copy.cancelTitle}</h1><p>{copy.hint}</p></div></div>
        <button className="publish-button" onClick={() => onChoose("single")} type="button" disabled={busy}>{copy.single}</button>
        <button className={action === "cancel" ? "danger-action" : "telegram-close-button compact"} onClick={() => onChoose("following")} type="button" disabled={busy}>{copy.following}</button>
      </article>
    </div>
  );
}

function CreateView({ language, initialActivity, seriesEditScope, copySeed, onCreated, onCancel }: { language: Language; initialActivity: Activity | null; seriesEditScope: ActivitySeriesMutationScope | null; copySeed: ActivityCopySeed | null; onCreated: (id: string, setupFailures?: EventChannelSetupFailures) => void; onCancel: () => void }) {
  const createActivity = useAppStore((state) => state.createActivity);
  const createWeeklyActivitySeries = useAppStore((state) => state.createWeeklyActivitySeries);
  const updateActivitySeriesOccurrence = useAppStore((state) => state.updateActivitySeriesOccurrence);
  const updateActivity = useAppStore((state) => state.updateActivity);
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const setSelectedCity = useAppStore((state) => state.setSelectedCity);
  const formRef = useRef<HTMLFormElement>(null);
  const templateGesture = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const seriesIdempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const seed = initialActivity || copySeed;
  const [categoryId, setCategoryId] = useState(seed?.categoryId || "sport");
  const [cityId, setCityId] = useState(seed?.cityId || selectedCityId);
  const [recurrenceMode, setRecurrenceMode] = useState<"none" | "weekly">("none");
  const [recurrenceBoundary, setRecurrenceBoundary] = useState<"untilDate" | "occurrenceCount">("untilDate");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [priceError, setPriceError] = useState("");
  const [uiLanguage, setCreateUiLanguage] = useState<UiLanguage>(() => getStoredUiLanguage(language));
  const t = getTranslation(language);
  const seriesCopy = weeklyActivitySeriesCopy[language];
  const channelCreateCopy = eventChannelCreateCopy[uiLanguage];
  const selectedCity = getCity(cityId);
  const initialAddress = seed?.address || getCity(seed?.cityId || selectedCityId).name[language];
  const [addressValue, setAddressValue] = useState(initialAddress);
  const [locationUrlValue, setLocationUrlValue] = useState(
    seed?.locationUrl || buildEventLocationUrl(initialAddress, getCity(seed?.cityId || selectedCityId).name[language]),
  );
  const [savedLocations] = useState(loadSavedEventLocations);
  const today = new Date().toISOString().slice(0, 10);
  const initialSport = seed?.metadata?.sport || {};
  const createCategories = seed ? categories : closedBetaCategories;
  const createActivityOptions: Partial<typeof activityOptions> = seed ? activityOptions : closedBetaActivityOptions;

  useEffect(() => {
    setCreateUiLanguage(getStoredUiLanguage(language));
  }, [language]);

  useEffect(() => {
    const handleUiLanguageChange = (event: Event) => {
      const nextLanguage = (event as CustomEvent<UiLanguage>).detail;
      if (nextLanguage) setCreateUiLanguage(nextLanguage);
    };
    window.addEventListener(uiLanguageChangedEvent, handleUiLanguageChange);
    return () => window.removeEventListener(uiLanguageChangedEvent, handleUiLanguageChange);
  }, []);
  const quickTemplates = [
    { id: "volleyball", label: t.favoriteVolleyball, icon: "🏐", categoryId: "sport", activity: "🏐", title: t.favoriteVolleyball, description: t.favoriteVolleyball, capacity: 8 },
    { id: "running", label: t.favoriteRunning, icon: "🏃", categoryId: "sport", activity: "🏃", title: t.favoriteRunning, description: t.favoriteRunning, capacity: 6 },
    { id: "coffee", label: t.templateCoffee, icon: "☕", categoryId: "activities", activity: "☕", title: t.templateCoffee, description: t.templateCoffee, capacity: 4 },
    { id: "walk", label: t.templateWalk, icon: "🚶", categoryId: "social", activity: "🚶", title: t.templateWalk, description: t.templateWalk, capacity: 6 },
    { id: "board-games", label: t.templateBoardGames, icon: "🎲", categoryId: "activities", activity: "🎲", title: t.templateBoardGames, description: t.templateBoardGames, capacity: 6 },
    { id: "language-exchange", label: t.favoriteLanguageExchange, icon: "🗣️", categoryId: "social", activity: "🗣️", title: t.favoriteLanguageExchange, description: t.favoriteLanguageExchange, capacity: 6 },
  ];

  const setFieldValue = (name: string, value: string) => {
    const field = formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (field) field.value = value;
  };

  const applyTemplate = (template: (typeof quickTemplates)[number]) => {
    const options = createActivityOptions[template.categoryId] || closedBetaActivityOptions.sport;
    const option = options.find((item) => item.icon === template.activity) || options[0];
    setCategoryId(template.categoryId);
    window.requestAnimationFrame(() => {
      setFieldValue("activityText", option.name[language]);
      setFieldValue("descriptionText", template.description);
      setFieldValue("capacity", String(template.capacity));
    });
  };

  const handleTemplatePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    templateGesture.current = { x: event.clientX, y: event.clientY, dragged: false };
  };

  const handleTemplatePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = templateGesture.current;
    if (!gesture || gesture.dragged) return;
    if (isTemplateCarouselDrag(gesture, { x: event.clientX, y: event.clientY })) gesture.dragged = true;
  };

  const finishTemplateGesture = () => {
    window.setTimeout(() => { templateGesture.current = null; }, 0);
  };

  const handleTemplateClick = (template: (typeof quickTemplates)[number]) => {
    if (templateGesture.current?.dragged) {
      templateGesture.current = null;
      return;
    }
    applyTemplate(template);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    const data = new FormData(event.currentTarget);
    const activityText = stripLeadingEmoji(String(data.get("activityText")));
    const rawDescription = String(data.get("descriptionText")).trim();
    const rawAddress = String(data.get("address")).trim();
    const rawLocationUrl = String(data.get("locationUrl") || "").trim()
      || buildEventLocationUrl(rawAddress, selectedCity.name[language]);
    const rawParticipantNote = String(data.get("participantNote") || "").trim();
    const date = String(data.get("date"));
    const price = Number(data.get("price"));
    const capacity = Number(data.get("capacity"));
    const activityChatChoice = initialActivity ? "no" : String(data.get("activityChatChoice") || "");
    const telegramTopicChoice = initialActivity ? "no" : String(data.get("telegramTopicChoice") || "");
    const recurrenceUntilDate = recurrenceMode === "weekly" && recurrenceBoundary === "untilDate"
      ? String(data.get("recurrenceUntilDate") || "")
      : undefined;
    const recurrenceOccurrenceCount = recurrenceMode === "weekly" && recurrenceBoundary === "occurrenceCount"
      ? Number(data.get("recurrenceOccurrenceCount"))
      : undefined;
    const fieldError =
      validateRequiredText(activityText, t)
      || validateRequiredText(rawDescription, t)
      || validateRequiredText(rawAddress, t)
      || validateEventDate(date, t)
      || validateMaxLength(rawDescription, MAX_EVENT_DESCRIPTION_LENGTH, t.descriptionTooLong)
      || validateMaxLength(rawAddress, MAX_EVENT_ADDRESS_LENGTH, t.addressTooLong)
      || validateMaxLength(rawParticipantNote, MAX_EVENT_NOTE_LENGTH, t.noteTooLong)
      || validateEventCapacity(capacity, t)
      || validateOptionalUrl(rawLocationUrl, t);
    if (!initialActivity && !["yes", "no"].includes(activityChatChoice)) {
      setFormError(channelCreateCopy.activityChatRequired);
      setSubmitting(false);
      return;
    }
    if (!initialActivity && !["yes", "no"].includes(telegramTopicChoice)) {
      setFormError(channelCreateCopy.telegramTopicRequired);
      setSubmitting(false);
      return;
    }
    if (fieldError) {
      setFormError(fieldError);
      setSubmitting(false);
      return;
    }
    if (!initialActivity && recurrenceMode === "weekly") {
      const resolution = resolveWeeklySeriesDates(date, {
        untilDate: recurrenceUntilDate,
        occurrenceCount: recurrenceOccurrenceCount,
      });
      if (!resolution.ok) {
        setFormError(seriesCopy.invalidBoundary);
        setSubmitting(false);
        return;
      }
    }
    const priceError = validateEventPrice(price, t);
    if (priceError) {
      setPriceError(priceError);
      setFormError("");
      setSubmitting(false);
      return;
    }

    const activity: NewActivity = {
      type: categoryId === "sport" ? "sport" : "custom",
      categoryId,
      activityText,
      titleText: activityText,
      descriptionText: rawDescription,
      date,
      time: String(data.get("time")),
      cityId,
      address: rawAddress,
      locationUrl: rawLocationUrl || undefined,
      participantNote: rawParticipantNote || undefined,
      price,
      capacity,
      visibility: String(data.get("visibility")) as NewActivity["visibility"],
      metadata: categoryId === "sport" ? { sport: sportMetadataFromForm(data, activityText) } : undefined,
    };
    try {
      let id: string;
      if (initialActivity) {
        if (initialActivity.seriesId) {
          if (!seriesEditScope) throw new Error("Recurring Activity edit scope is required");
          id = await updateActivitySeriesOccurrence(initialActivity.id, activity, seriesEditScope);
        } else {
          id = await updateActivity(initialActivity.id, activity);
        }
      } else if (recurrenceMode === "weekly") {
        const boundary = {
          untilDate: recurrenceUntilDate,
          occurrenceCount: recurrenceOccurrenceCount,
        };
        const fingerprint = JSON.stringify({ activity, boundary });
        if (!seriesIdempotencyRef.current || seriesIdempotencyRef.current.fingerprint !== fingerprint) {
          seriesIdempotencyRef.current = { fingerprint, key: createActivitySeriesIdempotencyKey() };
        }
        const result = await createWeeklyActivitySeries({
          ...activity,
          ...boundary,
          idempotencyKey: seriesIdempotencyRef.current.key,
        });
        id = result.activityIds[0] || "";
        if (!id) throw new Error("Weekly activity series returned no occurrences");
      } else {
        id = await createActivity(activity);
      }
      const setupFailures: EventChannelSetupFailures = { activityChat: false, telegramTopic: false };
      if (!initialActivity && activityChatChoice === "yes") {
        try {
          await ensureActivityChat(id);
        } catch {
          setupFailures.activityChat = true;
        }
      }
      if (!initialActivity && telegramTopicChoice === "yes") {
        try {
          await createEventForumTopic(id);
        } catch {
          setupFailures.telegramTopic = true;
        }
      }
      rememberEventLocation(rawAddress, rawLocationUrl);
      setSelectedCity(cityId);
      seriesIdempotencyRef.current = null;
      onCreated(id, setupFailures);
      if (!initialActivity) event.currentTarget.reset();
    } catch {
      setFormError(t.publishError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="page-section create-page">
      <button className="back-button" onClick={onCancel} type="button"><ArrowLeft size={20} /></button>
      <div className="page-title">{initialActivity ? <Pencil /> : <Plus />}<div><h1>{initialActivity ? t.edit : t.createTitle}</h1><p>{t.createHint}</p></div></div>
      <form className="create-form" ref={formRef} onSubmit={submit}>
        <div className="template-row" aria-label={t.quickTemplates}>
          <span>{t.quickTemplates}</span>
          <div
            data-no-tab-swipe
            onPointerDown={handleTemplatePointerDown}
            onPointerMove={handleTemplatePointerMove}
            onPointerUp={finishTemplateGesture}
            onPointerCancel={finishTemplateGesture}
          >
            {quickTemplates.map((template) => (
              <button key={template.id} onClick={() => handleTemplateClick(template)} type="button">
                {template.icon} {template.label}
              </button>
            ))}
          </div>
        </div>
        <label><span>{t.category}</span><select name="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{createCategories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name[language]}</option>)}</select></label>
        <label><span>{t.activity}</span><select key={`${categoryId}-${language}`} name="activityText" defaultValue={seed?.categoryId === categoryId ? stripLeadingEmoji(seed.activity[language]) : undefined} required>{(createActivityOptions[categoryId] || []).map((option) => <option key={`${option.icon}-${option.name[language]}`} value={option.name[language]}>{option.icon} {option.name[language]}</option>)}</select></label>
        {categoryId === "sport" && (
          <Suspense fallback={<div className="sport-create-panel">{t.loadingEvents}</div>}>
            <LazySportCreateFields language={language} initialSport={initialSport} />
          </Suspense>
        )}
        <label><span>{t.description}</span><textarea name="descriptionText" rows={4} defaultValue={seed?.description[language]} maxLength={MAX_EVENT_DESCRIPTION_LENGTH} required /></label>
        <div className="form-row">
          <label><span>{t.date}</span><input name="date" type="date" min={today} defaultValue={initialActivity?.date || (copySeed ? "" : today)} required /></label>
          <label><span>{t.time}</span><input name="time" type="time" defaultValue={initialActivity?.time || (copySeed ? "" : "18:00")} required /></label>
        </div>
        <label><span>{t.city}</span><select name="cityId" value={cityId} onChange={(event) => {
          const nextCityId = event.target.value;
          const oldAutoUrl = buildEventLocationUrl(addressValue, selectedCity.name[language]);
          const nextCityName = getCity(nextCityId).name[language];
          setCityId(nextCityId);
          if (!locationUrlValue || locationUrlValue === oldAutoUrl) setLocationUrlValue(buildEventLocationUrl(addressValue, nextCityName));
        }} required>{cities.map((city) => <option key={city.id} value={city.id}>{city.name[language]}</option>)}</select></label>
        <label><span>{t.address}</span><input name="address" list="saved-event-locations" value={addressValue} onChange={(event) => {
          const nextAddress = event.target.value;
          const previousAutoUrl = buildEventLocationUrl(addressValue, selectedCity.name[language]);
          const saved = savedLocations.find((item) => item.address.toLocaleLowerCase() === nextAddress.trim().toLocaleLowerCase());
          setAddressValue(nextAddress);
          if (saved?.locationUrl) setLocationUrlValue(saved.locationUrl);
          else if (!locationUrlValue || locationUrlValue === previousAutoUrl) setLocationUrlValue(buildEventLocationUrl(nextAddress, selectedCity.name[language]));
        }} maxLength={MAX_EVENT_ADDRESS_LENGTH} required /></label>
        <datalist id="saved-event-locations">{savedLocations.map((item) => <option key={item.address} value={item.address} />)}</datalist>
        <label><span>{t.locationUrl}</span><input name="locationUrl" type="url" value={locationUrlValue} onChange={(event) => setLocationUrlValue(event.target.value)} placeholder={t.locationPlaceholder} /></label>
        <label><span>{t.participantNote}</span><textarea name="participantNote" rows={3} defaultValue={seed?.participantNote} maxLength={MAX_EVENT_NOTE_LENGTH} placeholder={t.participantNotePlaceholder} /></label>
        <div className="form-row">
          <label className="price-field"><span>{t.price}</span><input name="price" type="number" min="0" max={MAX_EVENT_PRICE} defaultValue={seed?.price ?? 0} onInput={(event) => setPriceError(validateEventPrice(Number(event.currentTarget.value), t))} onChange={(event) => setPriceError(validateEventPrice(Number(event.currentTarget.value), t))} required /><small className="field-error">{priceError || t.priceTooHigh}</small></label>
          <label><span>{t.capacity}</span><input name="capacity" type="number" min={MIN_EVENT_CAPACITY} max={MAX_EVENT_CAPACITY} defaultValue={seed?.capacity || 8} required /></label>
        </div>
        <fieldset>
          <legend>{t.visibility}</legend>
          <div className="segmented">
            <label><input name="visibility" type="radio" value="public" defaultChecked={!seed || seed.visibility === "public"} /><span>{t.public}</span></label>
            <label><input name="visibility" type="radio" value="private" defaultChecked={seed?.visibility === "private"} /><span>{t.private}</span></label>
            <label><input name="visibility" type="radio" value="invite" defaultChecked={seed?.visibility === "invite"} /><span>{t.invite}</span></label>
          </div>
        </fieldset>
        {!initialActivity ? (
          <>
            <fieldset>
              <legend>{seriesCopy.legend}</legend>
              <div className="segmented">
                <label><input name="recurrenceMode" type="radio" value="none" checked={recurrenceMode === "none"} onChange={() => setRecurrenceMode("none")} /><span>{seriesCopy.none}</span></label>
                <label><input name="recurrenceMode" type="radio" value="weekly" checked={recurrenceMode === "weekly"} onChange={() => setRecurrenceMode("weekly")} /><span>{seriesCopy.weekly}</span></label>
              </div>
            </fieldset>
            {recurrenceMode === "weekly" ? (
              <fieldset>
                <legend>{seriesCopy.boundaryLegend}</legend>
                <div className="segmented">
                  <label><input name="recurrenceBoundary" type="radio" value="untilDate" checked={recurrenceBoundary === "untilDate"} onChange={() => setRecurrenceBoundary("untilDate")} /><span>{seriesCopy.untilDate}</span></label>
                  <label><input name="recurrenceBoundary" type="radio" value="occurrenceCount" checked={recurrenceBoundary === "occurrenceCount"} onChange={() => setRecurrenceBoundary("occurrenceCount")} /><span>{seriesCopy.occurrenceCount}</span></label>
                </div>
                <div className="form-row">
                  {recurrenceBoundary === "untilDate"
                    ? <label><span>{seriesCopy.untilDate}</span><input name="recurrenceUntilDate" type="date" min={today} required /></label>
                    : <label><span>{seriesCopy.occurrenceCount}</span><input name="recurrenceOccurrenceCount" type="number" min="1" max={MAX_WEEKLY_SERIES_OCCURRENCES} defaultValue="4" required /></label>}
                </div>
              </fieldset>
            ) : null}
            <fieldset>
              <legend>{channelCreateCopy.activityChatLegend}</legend>
              <div className="segmented">
                <label><input name="activityChatChoice" type="radio" value="yes" required /><span>{channelCreateCopy.yes}</span></label>
                <label><input name="activityChatChoice" type="radio" value="no" required /><span>{channelCreateCopy.no}</span></label>
              </div>
            </fieldset>
            <fieldset>
              <legend>{channelCreateCopy.telegramTopicLegend}</legend>
              <div className="segmented">
                <label><input name="telegramTopicChoice" type="radio" value="yes" required /><span>{channelCreateCopy.yes}</span></label>
                <label><input name="telegramTopicChoice" type="radio" value="no" required /><span>{channelCreateCopy.no}</span></label>
              </div>
            </fieldset>
            {recurrenceMode === "weekly" ? <small>{channelCreateCopy.firstOccurrenceOnly}</small> : null}
          </>
        ) : null}
        {formError && <div className="form-error">{formError}</div>}
        <button className="publish-button" type="submit" disabled={submitting || Boolean(priceError)}>{initialActivity ? <Pencil size={20} /> : <Sparkles size={20} />}{submitting ? "…" : initialActivity ? t.save : t.publish}</button>
      </form>
    </section>
  );
}

type LocalProfile = {
  name: string;
  bio: string;
  cityId: string;
  avatar: string;
  registeredAt: string;
  favoriteActivities: string[];
};

const avatarOptions = ["GI", "GO", "IRL", "🏐", "🎉", "🌿"];
const maxAvatarBytes = 5 * 1024 * 1024;
const profilePolishCopy: Record<Language, { title: string; hint: string; upload: string; formats: string; invalid: string }> = {
  ru: { title: "Профиль", hint: "Настройте профиль и интересы", upload: "Нажмите или перетащите фото", formats: "JPG или PNG до 5 МБ", invalid: "Выберите JPG или PNG размером до 5 МБ" },
  uk: { title: "Профіль", hint: "Налаштуйте профіль та інтереси", upload: "Натисніть або перетягніть фото", formats: "JPG або PNG до 5 МБ", invalid: "Виберіть JPG або PNG розміром до 5 МБ" },
  cs: { title: "Profil", hint: "Nastavte profil a zájmy", upload: "Klikněte nebo přetáhněte fotku", formats: "JPG nebo PNG do 5 MB", invalid: "Vyberte JPG nebo PNG do 5 MB" },
  en: { title: "Profile", hint: "Set up your profile and interests", upload: "Click or drag a photo here", formats: "JPG or PNG up to 5 MB", invalid: "Choose a JPG or PNG up to 5 MB" },
};

const loadProfile = (fallbackName: string, fallbackCityId: string): LocalProfile => {
  const stored = localStorage.getItem("go-irl-profile");
  const registeredAt = localStorage.getItem("go-irl-registered-at") || new Date().toISOString();
  localStorage.setItem("go-irl-registered-at", registeredAt);
  if (!stored) return { name: fallbackName, bio: "", cityId: fallbackCityId, avatar: "GI", registeredAt, favoriteActivities: [] };

  try {
    const parsed = JSON.parse(stored) as Partial<LocalProfile>;
    return {
      name: parsed.name || fallbackName,
      bio: parsed.bio || "",
      cityId: parsed.cityId || fallbackCityId,
      avatar: parsed.avatar || "GI",
      registeredAt: parsed.registeredAt || registeredAt,
      favoriteActivities: Array.isArray(parsed.favoriteActivities) ? parsed.favoriteActivities : [],
    };
  } catch {
    return { name: fallbackName, bio: "", cityId: fallbackCityId, avatar: "GI", registeredAt, favoriteActivities: [] };
  }
};

type ProfileViewState = {
  name: string;
  bio: string;
  cityId: string;
  avatar: string;
  avatarPath: string | null;
  avatarCode: string | null;
  registeredAt: string;
  favoriteActivities: string[];
  isPublic: boolean;
  showFavorites: boolean;
};

const createFallbackProfileViewState = (name: string, cityId: string): ProfileViewState => ({
  name,
  bio: "",
  cityId,
  avatar: "GI",
  avatarPath: null,
  avatarCode: "GI",
  registeredAt: new Date().toISOString(),
  favoriteActivities: [],
  isPublic: true,
  showFavorites: true,
});

const mapProfileViewState = (profile: UserProfile, avatar: string): ProfileViewState => ({
  name: profile.displayName,
  bio: profile.bio,
  cityId: profile.cityId,
  avatar: avatar || profile.avatarCode || "GI",
  avatarPath: profile.avatarPath,
  avatarCode: profile.avatarCode,
  registeredAt: profile.createdAt,
  favoriteActivities: profile.favoriteActivityIds,
  isPublic: profile.isPublic,
  showFavorites: profile.showFavorites,
});

const isProfileAvatarImage = (value: string) => value.startsWith("data:image/") || /^https?:\/\//.test(value);

function ProfileView({ language, onOpen, onJoin, onCloseMiniApp }: { language: Language; onOpen: OpenActivity; onJoin: (activity: Activity) => void; onCloseMiniApp: () => void }) {
  const { activities, joinedIds, pendingIds, loading, syncError, selectedCityId, setSelectedCity } = useAppStore();
  const [editing, setEditing] = useState(false);
  const t = getTranslation(language);
  const tgUser = getTelegramWebApp()?.initDataUnsafe?.user;
  const fallbackName = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" ") || t.guestName;
  const identity = getCurrentAuthIdentity();
  const identityKey = identity?.source === "trusted-telegram" ? identity.user.userKey : getUserKey();
  const repository = useMemo<ProfileRepository>(() => createProfileRepository({
    identity,
    supabaseClient: supabase,
    storage: localStorage,
    fallbackDisplayName: fallbackName,
    fallbackCityId: selectedCityId,
  }), [fallbackName, identityKey, selectedCityId]);
  const [profile, setProfile] = useState<ProfileViewState>(() => createFallbackProfileViewState(fallbackName, selectedCityId));
  const [avatarDraft, setAvatarDraft] = useState(profile.avatar);
  const [avatarPathDraft, setAvatarPathDraft] = useState<string | null>(profile.avatarPath);
  const [avatarCodeDraft, setAvatarCodeDraft] = useState<string | null>(profile.avatarCode);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const userKey = getUserKey();
  const city = getCity(profile.cityId);
  const today = new Date().toISOString().slice(0, 10);
  const organized = activities.filter((item) => item.organizerKey === userKey);
  const participating = activities.filter((item) => joinedIds.includes(item.id) && item.organizerKey !== userKey);
  const pendingRequests = activities.filter((item) => pendingIds.includes(item.id));
  const activeEvents = activities.filter((item) => item.date >= today && (item.organizerKey === userKey || joinedIds.includes(item.id) || pendingIds.includes(item.id)));
  const joinedCount = activities.filter((item) => joinedIds.includes(item.id)).length;
  const registeredLabel = new Intl.DateTimeFormat(localeByLanguage[language], { day: "numeric", month: "short", year: "numeric" }).format(safeDate(profile.registeredAt));
  const favoriteOptions = favoriteActivityOptions(language);
  const selectedFavorites = favoriteOptions.filter((option) => profile.favoriteActivities.includes(option.id));
  const profileCopy = profilePolishCopy[language];

  useEffect(() => {
    let active = true;
    setProfileLoading(true);
    setProfileError(false);
    void repository.loadOwnProfile()
      .then(async (loaded) => {
        if (!active) return;
        if (!loaded) {
          const fallback = createFallbackProfileViewState(fallbackName, selectedCityId);
          setProfile(fallback);
          setAvatarDraft(fallback.avatar);
          setAvatarPathDraft(null);
          setAvatarCodeDraft("GI");
          return;
        }
        const resolvedAvatar = loaded.avatarPath
          ? await repository.resolveAvatarUrl(loaded.avatarPath)
          : loaded.avatarCode || "GI";
        if (!active) return;
        const next = mapProfileViewState(loaded, resolvedAvatar);
        setProfile(next);
        setAvatarDraft(next.avatar);
        setAvatarPathDraft(next.avatarPath);
        setAvatarCodeDraft(next.avatarCode);
      })
      .catch(() => { if (active) setProfileError(true); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [fallbackName, repository, selectedCityId]);

  const processAvatarFile = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > maxAvatarBytes) {
      setAvatarError(profileCopy.invalid);
      return;
    }

    setAvatarError("");
    setAvatarBusy(true);
    try {
      const cropped = await openAvatarCropper(file);
      if (!cropped) return;
      const stored = await repository.uploadAvatar(cropped);
      const display = stored.startsWith("data:image/") ? stored : await repository.resolveAvatarUrl(stored);
      setAvatarDraft(display);
      setAvatarPathDraft(stored);
      setAvatarCodeDraft(null);
    } catch {
      setAvatarError(profileCopy.invalid);
    } finally {
      setAvatarBusy(false);
    }
  };

  const selectAvatarCode = (avatar: string) => {
    setAvatarDraft(avatar);
    setAvatarPathDraft(null);
    setAvatarCodeDraft(avatar);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const draft: UserProfileDraft = {
      displayName: String(data.get("profileName") || fallbackName).trim() || fallbackName,
      bio: String(data.get("profileBio") || "").trim(),
      cityId: String(data.get("profileCity") || selectedCityId),
      avatarPath: avatarPathDraft,
      avatarCode: avatarCodeDraft,
      isPublic: profile.isPublic,
      showFavorites: profile.showFavorites,
      favoriteActivityIds: data.getAll("favoriteActivities").map(String),
    };
    setAvatarBusy(true);
    setProfileError(false);
    try {
      const saved = await repository.saveOwnProfile(draft);
      const resolvedAvatar = saved.avatarPath
        ? await repository.resolveAvatarUrl(saved.avatarPath)
        : saved.avatarCode || "GI";
      const next = mapProfileViewState(saved, resolvedAvatar);
      setProfile(next);
      setAvatarDraft(next.avatar);
      setAvatarPathDraft(next.avatarPath);
      setAvatarCodeDraft(next.avatarCode);
      setSelectedCity(next.cityId);
      setEditing(false);
      notifyTelegram("success");
    } catch {
      setProfileError(true);
      notifyTelegram("error");
    } finally {
      setAvatarBusy(false);
    }
  };

  const renderProfileSection = (section: ProfilePanelSection) => {
    if (section === "preferences") return <ProfilePreferences language={language} />;

    if (section === "diagnostics") {
      return (
        <div className="profile-diagnostics">
          {(syncError || profileError) && <div className="details-error profile-error"><ShieldCheck /><span>{t.databaseError}</span></div>}
          <button className="telegram-close-button" onClick={onCloseMiniApp} type="button">{t.backToTelegram}</button>
        </div>
      );
    }

    if (section === "my-go-irl") {
      return (
        <div className="profile-my-go-irl">
          {(loading || profileLoading) && <ProfileSkeleton />}
          {(syncError || profileError) && <div className="details-error profile-error"><ShieldCheck /><span>{t.databaseError}</span></div>}
          <SectionHeader title={t.favoriteActivities} />
          {selectedFavorites.length ? (
            <div className="profile-interest-list">
              {selectedFavorites.map((option) => <span key={option.id}>{option.label}</span>)}
            </div>
          ) : (
            <EmptyState text={t.noFavoriteActivities} />
          )}
          <SectionHeader title={t.profileStats} />
          <div className="life-grid profile-stats-grid">
            <Metric icon={<Star />} value={String(organized.length)} label={t.createdEvents} />
            <Metric icon={<UserRoundCheck />} value={String(joinedCount)} label={t.visitedEvents} />
            <Metric icon={<Zap />} value={String(activeEvents.length)} label={t.activeEvents} />
            <Metric icon={<Clock3 />} value={String(pendingRequests.length)} label={t.pendingRequests} />
          </div>
          <SectionHeader title={t.myEvents} />
          <ProfileEventGroup title={t.organizing} activities={organized} language={language} emptyText={t.noOrganizedEvents} onOpen={onOpen} onJoin={onJoin} />
          <ProfileEventGroup title={t.participating} activities={participating} language={language} emptyText={t.noJoinedEvents} onOpen={onOpen} onJoin={onJoin} />
          <ProfileEventGroup title={t.waitingDecision} activities={pendingRequests} language={language} emptyText={t.noPendingRequests} onOpen={onOpen} onJoin={onJoin} />
          <button className="telegram-close-button" onClick={onCloseMiniApp} type="button">{t.backToTelegram}</button>
        </div>
      );
    }

    return (
      <div className="profile-identity">
        {(loading || profileLoading) && <ProfileSkeleton />}
        {(syncError || profileError) && <div className="details-error profile-error"><ShieldCheck /><span>{t.databaseError}</span></div>}
        {!editing && <div className="profile-hero">
          <div className="profile-avatar">{isProfileAvatarImage(profile.avatar) ? <img src={profile.avatar} alt={t.avatar} /> : profile.avatar}</div>
          <div className="profile-main">
            <div className="profile-kicker"><MapPin />{city.name[language]}</div>
            <h1>{profile.name}</h1>
            <p>{profile.bio || t.profileBioFallback}</p>
            <small>{t.registeredAt}: {registeredLabel}</small>
          </div>
          <button className="profile-edit-button" onClick={() => setEditing(true)} type="button"><Pencil size={18} />{t.editProfile}</button>
        </div>}
        {editing && (
          <form id="profile-edit-form" className="profile-edit-form" onSubmit={saveProfile}>
            <button
              className="profile-edit-close"
              onClick={() => {
                setAvatarDraft(profile.avatar);
                setAvatarPathDraft(profile.avatarPath);
                setAvatarCodeDraft(profile.avatarCode);
                setAvatarError("");
                setEditing(false);
              }}
              type="button"
              aria-label={t.close}
              disabled={avatarBusy}
            ><X /></button>
            <div className="profile-edit-intro">
              <h1>{profileCopy.title}</h1>
              <p>{profileCopy.hint}</p>
              <label className={`profile-edit-avatar${avatarBusy ? " is-busy" : ""}`}>
                <input type="file" accept="image/jpeg,image/png" disabled={avatarBusy} aria-label={t.avatar} onChange={(event) => {
                  const input = event.currentTarget;
                  void processAvatarFile(input.files?.[0]).finally(() => { input.value = ""; });
                }} />
                {isProfileAvatarImage(avatarDraft) ? <img src={avatarDraft} alt={t.avatar} /> : <span>{avatarDraft}</span>}
                <i aria-hidden="true"><Camera size={20} /></i>
              </label>
            </div>
            <label><span>{t.name}</span><input name="profileName" defaultValue={profile.name} required /></label>
            <label><span>{t.shortBio}</span><textarea name="profileBio" rows={3} defaultValue={profile.bio} placeholder={t.profileBioPlaceholder} /></label>
            <label><span>{t.city}</span><select name="profileCity" defaultValue={profile.cityId}>{cities.map((item) => <option key={item.id} value={item.id}>{item.name[language]}</option>)}</select></label>
            <div className="interest-picker">
              <span>{t.favoriteActivities}</span>
              <p>{t.favoriteActivitiesHint}</p>
              <div>
                {favoriteOptions.map((option) => (
                  <label key={option.id}>
                    <input name="favoriteActivities" type="checkbox" value={option.id} defaultChecked={profile.favoriteActivities.includes(option.id)} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="profile-avatar-choice-label">{t.avatar}</div>
            <div className="avatar-picker" role="radiogroup" aria-label={t.avatar}>
              {avatarOptions.map((avatar) => (
                <label key={avatar}>
                  <input name="profileAvatar" type="radio" value={avatar} defaultChecked={profile.avatarCode === avatar} onChange={() => selectAvatarCode(avatar)} />
                  <span>{avatar}</span>
                </label>
              ))}
            </div>
            {avatarError && <div className="profile-avatar-error" role="alert">{avatarError}</div>}
            <button className="publish-button" type="submit" disabled={avatarBusy}><Pencil size={18} />{avatarBusy ? "…" : t.save}</button>
          </form>
        )}
      </div>
    );
  };

  return (
    <section className={`page-section profile-page${editing ? " is-editing" : ""}`}>
      <ProfilePanel
        language={language}
        editing={editing}
        renderSection={renderProfileSection}
      />
    </section>
  );
}

function ProfileEventGroup({ title, activities, language, emptyText, onOpen, onJoin }: { title: string; activities: Activity[]; language: Language; emptyText: string; onOpen: OpenActivity; onJoin: (activity: Activity) => void }) {
  return (
    <section className="profile-event-group">
      <h3>{title}</h3>
      {activities.length ? (
        <div className="activity-stack">{activities.map((activity) => <ActivityCard key={activity.id} activity={activity} language={language} onOpen={onOpen} onJoin={onJoin} />)}</div>
      ) : (
        <EmptyState text={emptyText} />
      )}
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="profile-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function ActivitySection({ title, activities, language, onOpen, onJoin, icon, urgent = false }: { title: string; activities: Activity[]; language: Language; onOpen: OpenActivity; onJoin: (activity: Activity) => void; icon?: React.ReactNode; urgent?: boolean }) {
  if (!activities.length) return null;
  return (
    <section className={urgent ? "activity-section urgent-section" : "activity-section"}>
      <SectionHeader title={title} icon={icon} />
      <div className="activity-stack">{activities.map((activity) => <ActivityCard key={activity.id} activity={activity} language={language} onOpen={onOpen} onJoin={onJoin} />)}</div>
    </section>
  );
}

function ActivityCard(props: { activity: Activity; language: Language; onOpen: OpenActivity; onJoin: (activity: Activity) => void; onOpenMembers?: (activity: Activity) => void; showWeather?: boolean }) {
  if (!isSportExperience(props.activity)) return <GenericActivityCard {...props} />;
  return (
    <Suspense fallback={<GenericActivityCard {...props} />}>
      <LazySportActivityCard {...props} />
    </Suspense>
  );
}

function GenericActivityCard({ activity, language, onOpen, onJoin }: { activity: Activity; language: Language; onOpen: OpenActivity; onJoin: (activity: Activity) => void; showWeather?: boolean }) {
  const { joinedIds, waitingIds, pendingIds } = useAppStore();
  const t = getTranslation(language);
  const category = getActivityCategory(activity);
  const joined = joinedIds.includes(activity.id);
  const waiting = waitingIds.includes(activity.id);
  const pending = pendingIds.includes(activity.id);
  const isOrganizer = activity.organizerKey === getUserKey();
  const full = activity.participants >= activity.capacity;
  const interaction = resolveEventInteractionState({
    isOrganizer,
    isJoined: joined,
    isWaiting: waiting,
    isPending: pending,
    isFull: full,
    visibility: activity.visibility,
    isFinished: isActivityFinished(activity),
    hasWaitingList: false,
  });
  const [membersPreviewOpen, setMembersPreviewOpen] = useState(false);
  const [helperState, setHelperState] = useState<"none" | "requested" | "confirmed">("none");
  const joinedMembers = activity.members.filter((member) => member.status === "joined");
  const pendingRequestCount = isOrganizer
    ? activity.members.filter((member) => member.status === "pending").length
    : 0;
  const shareTitle = stripLeadingEmoji(activity.activity[language]);
  const shareDate = `${compactDateLabel(activity.date, language)}${formatEventTime(activity.time) ? ` · ${formatEventTime(activity.time)}` : ""}`;
  const avatar = genericActivityAvatar(activity, language, category.icon);
  const mapLabel = activity.address.trim() || getCity(activity.cityId).name[language];
  const action = t[eventActionTranslationKey(interaction.primaryAction, "card")];
  const membershipActive = joined || pending || waiting;
  const cardRightLabel = joined || waiting ? t.leave : pending ? t.cancelRequest : action;
  const cardRightDisabled = !membershipActive && interaction.disabled;
  const cardLeftLabel = joined ? t.cardOpenChat : t.details;
  const handleCardLeftAction = () => {
    if (joined) {
      onOpen(activity, { focusChat: true });
      return;
    }
    onOpen(activity);
  };
  const handleCardRightAction = () => {
    if (membershipActive) {
      onJoin(activity);
      return;
    }
    runEventPrimaryAction(interaction.primaryAction, {
      open: () => onOpen(activity),
      openChat: () => onOpen(activity, { focusChat: true }),
      join: () => onJoin(activity),
    });
  };
  const helperAction = isOrganizer
    ? helperState === "confirmed"
      ? eventHelperCardCopy[language].confirmed
      : helperState === "requested"
        ? eventHelperCardCopy[language].requested
        : eventHelperCardCopy[language].needed
    : helperState === "confirmed"
      ? eventHelperCardCopy[language].confirmed
      : t.details;
  const showHelperAction = interaction.showHelperAction && (isOrganizer || helperState === "confirmed");

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getOrganizerRoleRequestState(activity.id)
        .then((state) => { if (active) setHelperState(state); })
        .catch(() => { if (active) setHelperState("none"); });
    };
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ activityId?: string }>).detail;
      if (!detail?.activityId || detail.activityId === activity.id) refresh();
    };
    refresh();
    window.addEventListener("go-irl-coach-requests-changed", onChanged);
    return () => {
      active = false;
      window.removeEventListener("go-irl-coach-requests-changed", onChanged);
    };
  }, [activity.id]);
  return (
    <article className="activity-card sport-card compact-sport-card unified-event-card glass-event-card">
      <EventCardArtwork icon={avatar} activity={activity.activity[language]} title={activity.title[language]} />
      <div className="sport-card-top-actions">
        {pendingRequestCount > 0 ? (
          <button
            className="event-request-alert"
            type="button"
            aria-label={`${t.requests}: ${pendingRequestCount}`}
            onClick={() => onOpen(activity, { focusRequests: true })}
          >
            <BellDot aria-hidden="true" />
            <span>{pendingRequestCount}</span>
          </button>
        ) : null}
        <CardReminderAction activityId={activity.id} date={activity.date} time={activity.time} />
        <CardShareAction
          title={shareTitle}
          date={shareDate}
          address={activity.address}
          url={activityInviteUrl(activity)}
          label={t.share}
          onTelegramShare={() => sharePreparedTelegramEvent(activity, language)}
        />
      </div>
      <button className="sport-card-main glass-event-card-main" onClick={() => onOpen(activity)} type="button">
        <h3>{shareTitle}</h3>
        <p>{stripLeadingEmoji(activity.title[language]) || mapLabel}</p>
      </button>
      <div className="sport-chip-row">
        <button
          className="sport-card-participants-chip"
          type="button"
          aria-label={`${t.participants}: ${activity.participants} / ${activity.capacity}`}
          aria-expanded={membersPreviewOpen}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMembersPreviewOpen((open) => !open);
          }}
        ><UsersRound size={16} aria-hidden="true" /><span>{activity.participants} / {activity.capacity}</span></button>
      </div>
      {membersPreviewOpen && (
        <div className="sport-card-members-preview">
          {joinedMembers.length ? joinedMembers.map((member) => (
            <div key={member.userKey} className="sport-card-member-preview-row">
              <span className="sport-card-member-avatar">{member.name?.slice(0, 2).toUpperCase() || "GO"}</span>
              <span className="sport-card-member-name">{member.name || "GO IRL User"}</span>
            </div>
          )) : <div className="sport-card-members-empty">{t.noParticipants || "Пока никого нет"}</div>}
        </div>
      )}
      <EventWeatherStrip activity={activity} language={language} enabled={isOutdoorGenericActivity(activity)} />
      <div className="activity-card-details sport-details-grid">
        <EventCardMetaItem icon={<CalendarDays />} caption={t.date} value={shareDate} ariaLabel={t.addToGoogleCalendar} onClick={() => openActivityCalendar(activity, language)} />
        <EventCardMetaItem icon={<Ticket />} caption={t.price.split(",")[0]} value={activity.price ? `${activity.price} Kč` : t.free} />
        <EventCardMetaItem icon={<MapPin />} caption={t.address} value={mapLabel} ariaLabel={`${t.address}: ${mapLabel}`} onClick={() => openActivityMap(activity)} />
        <OrganizerAvatarAction organizerKey={activity.organizerKey} organizerName={activity.organizer} />
      </div>
      <div className="activity-card-footer compact-sport-actions">
        {joined
          ? <button className="sport-coach-action" onClick={handleCardLeftAction} type="button"><UsersRound size={18} /><span>{cardLeftLabel}</span></button>
          : showHelperAction
            ? <button className="sport-coach-action" onClick={() => onOpen(activity)} type="button"><UsersRound size={18} /><span>{helperAction}</span></button>
            : <EventDetailsAction label={t.details} onClick={() => onOpen(activity)} />}
        <button className={membershipActive ? "card-join card-leave" : interaction.canJoin && !pending ? "card-join" : "card-join secondary"} onClick={handleCardRightAction} type="button" disabled={cardRightDisabled}>
          {cardRightLabel}
        </button>
      </div>
    </article>
  );
}

type ActivitySheetProps = {
  activity: Activity;
  language: Language;
  cityName: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onJoin: (activity: Activity) => void;
  onCalendar: (activity: Activity) => void;
  onEdit: (activity: Activity) => void;
  onCopy: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
  onCloseMiniApp: () => void;
  onNotice: (msg: string) => void;
  initialMembersOpen?: boolean;
  initialChatRequest?: number;
};

function ActivitySheet(props: ActivitySheetProps) {
  if (!isSportExperience(props.activity)) return <GenericActivitySheet {...props} />;
  return (
    <Suspense fallback={<GenericActivitySheet {...props} />}>
      <LazySportActivitySheet {...props} />
    </Suspense>
  );
}

function GenericActivitySheet({
  activity,
  language,
  cityName,
  loading,
  error,
  onClose,
  onJoin,
  onCalendar,
  onEdit,
  onCopy,
  onDelete,
  onCloseMiniApp,
  initialMembersOpen = false,
  initialChatRequest = 0,
}: ActivitySheetProps) {
  const { joinedIds, waitingIds, pendingIds, reviewRequest, userRole } = useAppStore();
  const [membersOpen, setMembersOpen] = useState(initialMembersOpen);
  const [chatOpenRequest, setChatOpenRequest] = useState(initialChatRequest);
  const moreActionsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    setMembersOpen(initialMembersOpen);
  }, [activity.id, initialMembersOpen]);

  useEffect(() => {
    setChatOpenRequest(initialChatRequest);
  }, [activity.id, initialChatRequest]);

  useEffect(() => {
    const closeMoreActions = () => {
      if (moreActionsRef.current?.open) moreActionsRef.current.open = false;
    };
    const handlePointerDown = (event: Event) => {
      const details = moreActionsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("scroll", closeMoreActions, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("scroll", closeMoreActions, true);
    };
  }, [activity.id]);

  const t = getTranslation(language);
  const shareTitle = stripLeadingEmoji(activity.activity[language]);
  const shareDate = `${compactDateLabel(activity.date, language)}${formatEventTime(activity.time) ? ` · ${formatEventTime(activity.time)}` : ""}`;
  const category = getActivityCategory(activity);
  const isOrganizer = activity.organizerKey === getUserKey();
  const canDelete = isOrganizer || userRole === "admin";
  const joined = joinedIds.includes(activity.id);
  const waiting = waitingIds.includes(activity.id);
  const pending = pendingIds.includes(activity.id);
  const full = activity.participants >= activity.capacity;
  const interaction = resolveEventInteractionState({
    isOrganizer,
    isJoined: joined,
    isWaiting: waiting,
    isPending: pending,
    isFull: full,
    visibility: activity.visibility,
    isFinished: isActivityFinished(activity),
    hasWaitingList: false,
  });
  const action = t[eventActionTranslationKey(interaction.primaryAction, "sheet")];
  const status = t[eventStatusTranslationKey(interaction)];
  const accessLabel = activity.visibility === "public" ? t.publicAccess : activity.visibility === "private" ? t.privateAccess : t.inviteAccess;
  const joinedMembers = activity.members.filter((member) => member.status === "joined");
  const waitingMembers = activity.members.filter((member) => member.status === "waiting");
  const pendingMembers = activity.members.filter((member) => member.status === "pending");
  const activityAvatar = genericActivityAvatar(activity, language, category.icon);
  const sheetBackgroundStyle = getEventSheetBackgroundStyle({
    icon: activityAvatar,
    activity: activity.activity[language],
    title: activity.title[language],
  });

  const handleReview = async (memberKey: string, approved: boolean) => {
    await reviewRequest(activity.id, memberKey, approved);
  };

  const handlePrimaryAction = () => runEventPrimaryAction(interaction.primaryAction, {
    open: () => onEdit(activity),
    openChat: () => setChatOpenRequest((request) => request + 1),
    join: () => onJoin(activity),
  });

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <article className="activity-sheet" style={sheetBackgroundStyle} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <button className="sheet-close" onClick={onClose} type="button" aria-label={t.close}><X /></button>
        {loading && <EventDetailsSkeleton />}
        {error && <div className="details-error"><ShieldCheck /><span>{t.databaseError}</span></div>}
        <div className={`sheet-symbol category-${category.id}`}>
          <ActivityIcon emoji={activityAvatar} label={activity.activity[language]} />
        </div>
        <div className="sheet-label">{category.name[language]} · {stripLeadingEmoji(activity.activity[language])}</div>
        <h2>{stripLeadingEmoji(activity.title[language])}</h2>
        <p className="sheet-description">{stripLeadingEmoji(activity.description[language])}</p>
        <div className="details-status-row">
          <span className={isOrganizer ? "details-status organizer" : pending ? "details-status pending" : joined ? "details-status joined" : full ? "details-status full" : "details-status"}>{status}</span>
          <span className="details-access">{accessLabel}</span>
        </div>
        <div className="detail-list">
          <div><Sparkles /><span>{t.category}</span><strong>{category.name[language]}</strong></div>
          <div className="calendar-date-action" onClick={() => onCalendar(activity)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onCalendar(activity); } }} role="button" tabIndex={0} aria-label={t.addToGoogleCalendar}><CalendarDays /><span>{dateLabel(activity.date, language)}</span>{formatEventTime(activity.time) ? <strong>{formatEventTime(activity.time)}</strong> : null}</div>
          <div><Compass /><span>{t.city}</span><strong>{cityName}</strong></div>
          <div><MapPin /><span>{t.address}</span>{activity.locationUrl ? <a href={activity.locationUrl} target="_blank" rel="noreferrer">{activity.address}</a> : <strong>{activity.address}</strong>}</div>
          <div><Ticket /><span>{t.price}</span><strong>{activity.price ? `${activity.price} Kč` : t.free}</strong></div>
          {activity.participantNote && <div><Sparkles /><span>{t.participantNote}</span><strong>{activity.participantNote}</strong></div>}
          <OrganizerDetailAction organizerKey={activity.organizerKey} organizerName={activity.organizer} label={t.organizer} />
          <div><ShieldCheck /><span>{t.visibility}</span><strong>{accessLabel}</strong></div>
        </div>
        <button className="detail-members-toggle" onClick={() => setMembersOpen((open) => !open)} type="button">
          <UsersRound />
          <span>{t.participants}</span>
          <strong>{activity.participants} / {activity.capacity}</strong>
          <ChevronRight className={membersOpen ? "open" : ""} />
        </button>
        {membersOpen && (
          <div className="members-popover-backdrop" onMouseDown={() => setMembersOpen(false)}>
            <div className="members-section members-popover" role="dialog" aria-modal="true" aria-label={t.participants} onMouseDown={(event) => event.stopPropagation()}>
              <button className="members-popover-close" onClick={() => setMembersOpen(false)} type="button" aria-label={t.close}><X /></button>
              <div className="members-list">
              {joinedMembers.map((member) => (
                <div className="member-row" key={member.userKey}>
                  <span className="member-avatar">{member.name.slice(0, 2).toUpperCase()}</span>
                  <strong>{member.name}</strong>
                  <UserRoundCheck />
                </div>
              ))}
              {!joinedMembers.length && <p>{t.noParticipants}</p>}
              {waitingMembers.length > 0 && <div className="waiting-heading">{t.waitingList} · {waitingMembers.length}</div>}
              {waitingMembers.map((member) => (
                <div className="member-row waiting-member" key={member.userKey}>
                  <span className="member-avatar">{member.name.slice(0, 2).toUpperCase()}</span>
                  <strong>{member.name}</strong>
                  <Clock3 />
                </div>
              ))}
              {isOrganizer && pendingMembers.length > 0 && <div className="pending-heading">{t.requests} · {pendingMembers.length}</div>}
              {isOrganizer && pendingMembers.map((member) => (
                <div className="member-row pending-member" key={member.userKey}>
                  <span className="member-avatar">{member.name.slice(0, 2).toUpperCase()}</span>
                  <strong>{member.name}</strong>
                  <span className="request-actions">
                    <button onClick={() => void handleReview(member.userKey, true)} type="button" aria-label={t.approve} title={t.approve}><Check /><span>{t.approve}</span></button>
                    <button onClick={() => void handleReview(member.userKey, false)} type="button" aria-label={t.reject} title={t.reject}><X /><span>{t.reject}</span></button>
                  </span>
                </div>
              ))}
              </div>
            </div>
          </div>
        )}
        {!isOrganizer && (joined || waiting || pending) && <div className="status-banner">{joined ? <UserRoundCheck /> : <Clock3 />}<span>{joined ? t.joined : waiting ? t.waiting : t.requested}</span></div>}
        {!isOrganizer && activity.visibility === "private" && !joined && !waiting && !pending && <div className="status-banner neutral"><ShieldCheck /><span>{t.privateJoinInfo}</span></div>}
        {full && !joined && !waiting && !pending && !isOrganizer && <div className="status-banner danger"><UsersRound /><span>{t.eventFull}</span></div>}
              <ActivityChatPanel activity={activity} openRequest={chatOpenRequest} showHelperAction={interaction.showHelperAction} />

      <div className="sheet-actions compact-sheet-actions">
          <button className="main-action" onClick={handlePrimaryAction} type="button" disabled={interaction.disabled}>{interaction.primaryAction === "manage" && <Pencil size={18} />}{action}</button>
          <details ref={moreActionsRef} className="event-more-actions">
            <summary className="square-action" aria-label="Еще" title="Еще"><Ellipsis aria-hidden="true" /></summary>
            <div className="event-more-menu">
              <CardShareAction
                title={shareTitle}
                date={shareDate}
                address={activity.address}
                url={activityInviteUrl(activity)}
                label={t.share}
                onTelegramShare={() => sharePreparedTelegramEvent(activity, language)}
                variant="menu"
              />
              <button onClick={() => onCalendar(activity)} type="button"><CalendarPlus size={18} />{t.addToGoogleCalendar}</button>
              {isOrganizer && <button onClick={() => onCopy(activity)} type="button"><Copy size={18} />{t.repeatEvent}</button>}
              <button onClick={() => openBugReport(activity, language)} type="button"><Bug size={18} />{t.report}</button>
            </div>
          </details>
        </div>
        {!isOrganizer && (joined || waiting || pending) && (
          <button className="danger-action membership-leave-action" onClick={() => onJoin(activity)} type="button">
            <X size={18} />
            {pending ? t.cancelRequest : t.leave}
          </button>
        )}
        {canDelete && (
          <button className="danger-action" onClick={() => onDelete(activity)} type="button">
            <Trash2 size={18} />
            {t.delete}
          </button>
        )}
        <button className="telegram-close-button compact" onClick={onCloseMiniApp} type="button">{t.backToTelegram}</button>
      </article>
    </div>
  );
}

function CompletionBar({
  activity,
  language,
  onCalendar,
  onCloseMiniApp,
}: {
  activity: Activity;
  language: Language;
  onCalendar: () => void;
  onCloseMiniApp: () => void;
}) {
  const t = getTranslation(language);
  const shareTitle = stripLeadingEmoji(activity.activity[language]);
  const shareDate = `${compactDateLabel(activity.date, language)}${formatEventTime(activity.time) ? ` · ${formatEventTime(activity.time)}` : ""}`;
  return (
    <div className="completion-bar post-save-actions" aria-label={t.createdSuccess}>
      <CardShareAction title={shareTitle} date={shareDate} address={activity.address} url={activityInviteUrl(activity)} label={t.share} onTelegramShare={() => sharePreparedTelegramEvent(activity, language)} />
      <button className="secondary" onClick={onCalendar} type="button"><CalendarPlus /><span>{t.addToGoogleCalendar}</span></button>
      <button className="secondary" onClick={onCloseMiniApp} type="button"><ArrowLeft /><span>{t.backToTelegram}</span></button>
    </div>
  );
}

function EventDetailsSkeleton() {
  return (
    <div className="details-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function BottomNav({ view, setView, language }: { view: AppView; setView: (view: AppView) => void; language: Language }) {
  const labels = clientNavigationLabels[language];
  const actions = domainActionLabels[language];
  const normalizedAppPath = window.location.pathname.replace(/\/+$/, "");
  const isServicesDomain = normalizedAppPath === "/services" || /^\/beauty\/[^/]+(?:\/(?:ru|uk|cs|en))?$/i.test(normalizedAppPath);
  const items: Array<{ id: AppView; label: string; icon: React.ReactNode }> = [
    { id: "home", label: labels[0], icon: <Home /> },
    { id: "discover", label: labels[1], icon: <Sparkles /> },
    { id: "explore", label: labels[2], icon: <Compass /> },
    isServicesDomain
      ? { id: "bookings", label: labels[3], icon: <CalendarDays /> }
      : { id: "create", label: actions.create, icon: <Plus /> },
    { id: "profile", label: isServicesDomain ? actions.professional : labels[4], icon: isServicesDomain ? <Sparkles /> : <CircleUserRound /> },
  ];
  return <nav className="bottom-nav">{items.map((item, index) => {
    if (isServicesDomain && index === items.length - 1) {
      return <a className="bottom-nav-link" href="/beauty/workspace" key="professional-workspace">{item.icon}<span>{item.label}</span></a>;
    }
    return <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)} type="button">{item.icon}<span>{item.label}</span></button>;
  })}</nav>;
}

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return <div className="section-title">{icon}<h2>{title}</h2></div>;
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return <div className="metric">{icon}<strong>{value}</strong><span>{label}</span></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><Dices /><p>{text}</p></div>;
}

function EventListSkeleton() {
  return (
    <div className="event-list-skeleton" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div className="event-skeleton-card" key={item}>
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export default App;
