import { beginFacebookWebAuth, beginGoogleWebAuth, isWebAuthProviderEnabled } from "./auth/googleWebAuth";
import { resolveActivityEntryIntent } from "./auth/activityEntryIntent";
import {
  activitySelectionReturnStorageKey,
  resolveGuestActivityAuthNavigation,
} from "./auth/activitySelectionNavigation";
import { cities } from "./config/cities";
import {
  guestActivityCatalogCityIds,
  guestProtectedActionSelector,
  isPublicGuestAppRoute,
  isPublicGuestServicesRoute,
} from "./guestAppAccess";
import { loadPublicActivityCatalogRows, type PublicActivityCatalogRow } from "./publicActivityPreviews";
import { loadProfessionalDirectory } from "./services/servicesProfessionalDirectory";
import { useAppStore } from "./store";
import type { Activity, ActivityType, Language } from "./types";
import "./guest-app-runtime.css";

const telegramBotUsername = String(import.meta.env.VITE_GO_IRL_BOT_USERNAME || "GOirl_bot").replace(/^@/, "");
const telegramAppName = String(import.meta.env.VITE_GO_IRL_APP_NAME || "").replace(/^\/+|\/+$/g, "");
const authStripId = "go-irl-guest-auth-strip";

const copy: Record<Language, { telegram: string; google: string; facebook: string; required: string; authError: string }> = {
  ru: { telegram: "Открыть в Telegram", google: "Google", facebook: "Facebook", required: "Войдите, чтобы продолжить", authError: "Не удалось начать вход" },
  uk: { telegram: "Відкрити в Telegram", google: "Google", facebook: "Facebook", required: "Увійдіть, щоб продовжити", authError: "Не вдалося почати вхід" },
  cs: { telegram: "Otevřít v Telegramu", google: "Google", facebook: "Facebook", required: "Pro pokračování se přihlaste", authError: "Přihlášení se nepodařilo spustit" },
  en: { telegram: "Open in Telegram", google: "Google", facebook: "Facebook", required: "Sign in to continue", authError: "Could not start sign-in" },
};

let installed = false;
let unsubscribeStore: (() => void) | null = null;

const normalizedPath = () => typeof window === "undefined" ? "" : window.location.pathname.replace(/\/+$/, "") || "/";
export const isGuestAppPath = (pathname = normalizedPath()) => isPublicGuestAppRoute(pathname);

const localized = (ru: string, cs: string) => ({ ru, uk: ru, cs, en: ru });

export const mapPublicActivityCatalogRow = (row: PublicActivityCatalogRow): Activity => ({
  id: row.id,
  type: (row.activity_type || (row.category_id === "sport" ? "sport" : "custom")) as ActivityType,
  categoryId: row.category_id,
  activity: localized(row.activity_ru, row.activity_cs),
  title: localized(row.title_ru, row.title_cs),
  description: localized(row.description_ru, row.description_cs),
  date: row.event_date,
  time: row.event_time.slice(0, 5),
  cityId: row.city_id || "olomouc",
  address: row.address,
  price: Number(row.price) || 0,
  capacity: Number(row.capacity) || 2,
  participants: Number(row.participant_count) || 0,
  members: [],
  organizer: "",
  organizerKey: "",
  visibility: "public",
  urgent: Boolean(row.urgent),
  popular: Boolean(row.popular),
});

const loadGuestState = async () => {
  const state = useAppStore.getState();
  const servicesDomain = isPublicGuestServicesRoute(normalizedPath());
  useAppStore.setState({ loading: true, syncError: null, userRole: "user" });

  try {
    if (servicesDomain) {
      const loads = [loadProfessionalDirectory(state.selectedCityId, "en", { browserMock: false })];
      if (state.language !== "en") loads.push(loadProfessionalDirectory(state.selectedCityId, state.language, { browserMock: false }));
      const results = await Promise.allSettled(loads);
      if (results.every((result) => result.status === "rejected")) throw new Error("public_services_unavailable");
      useAppStore.setState({
        activities: [],
        joinedIds: [],
        waitingIds: [],
        pendingIds: [],
        syncError: null,
      });
      return;
    }

    const cityIds = guestActivityCatalogCityIds(
      normalizedPath(),
      state.selectedCityId,
      cities.map((city) => city.id),
    );
    const results = await Promise.allSettled(cityIds.map((cityId) => loadPublicActivityCatalogRows(cityId)));
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<PublicActivityCatalogRow[]> => result.status === "fulfilled");
    if (!fulfilled.length) throw new Error("public_activities_unavailable");
    const selectedRows = fulfilled[0].value;
    const entryId = resolveActivityEntryIntent({ pathname: normalizedPath() })?.activityId;
    const entryRow = entryId
      ? fulfilled.flatMap((result) => result.value).find((row) => row.id === entryId)
      : undefined;
    const rows = entryRow && !selectedRows.some((row) => row.id === entryRow.id)
      ? [entryRow, ...selectedRows]
      : selectedRows;
    useAppStore.setState({
      activities: rows.map(mapPublicActivityCatalogRow),
      joinedIds: [],
      waitingIds: [],
      pendingIds: [],
      syncError: null,
    });
  } catch (error) {
    console.error(error);
    useAppStore.setState({
      activities: [],
      joinedIds: [],
      waitingIds: [],
      pendingIds: [],
      syncError: "database_unavailable",
    });
  } finally {
    useAppStore.setState({ loading: false });
  }
};

const authRequired = async (): Promise<never> => {
  throw new Error("authentication_required");
};

const installGuestStoreAdapter = () => {
  const setSelectedCity = (selectedCityId: string) => {
    if (!cities.some((city) => city.id === selectedCityId)) return;
    localStorage.setItem("go-irl-city", selectedCityId);
    useAppStore.setState({ selectedCityId });
    void loadGuestState();
  };

  useAppStore.setState({
    initialize: loadGuestState,
    disposeRealtime: () => undefined,
    setSelectedCity,
    toggleJoin: authRequired,
    createActivity: authRequired,
    updateActivity: authRequired,
    deleteActivity: authRequired,
    reviewRequest: authRequired,
    joinedIds: [],
    waitingIds: [],
    pendingIds: [],
    userRole: "user",
  });
};

const telegramEntryUrl = () => {
  const path = telegramAppName ? `/${telegramAppName}` : "";
  return `https://t.me/${telegramBotUsername}${path}`;
};

const startAuth = async (provider: "google" | "facebook", status: HTMLElement) => {
  status.textContent = "";
  try {
    if (provider === "facebook") await beginFacebookWebAuth();
    else await beginGoogleWebAuth();
  } catch {
    status.textContent = copy[useAppStore.getState().language].authError;
  }
};

const renderAuthStrip = () => {
  if (typeof document === "undefined") return;
  const language = useAppStore.getState().language;
  const labels = copy[language];
  let strip = document.getElementById(authStripId);
  if (!strip) {
    strip = document.createElement("section");
    strip.id = authStripId;
    strip.className = "guest-app-auth-strip";
    strip.setAttribute("aria-label", labels.required);
    document.body.appendChild(strip);
  }

  strip.replaceChildren();
  const telegram = document.createElement("a");
  telegram.className = "guest-app-auth-button telegram";
  telegram.href = telegramEntryUrl();
  telegram.textContent = labels.telegram;

  const google = document.createElement("button");
  google.className = "guest-app-auth-button";
  google.type = "button";
  google.textContent = labels.google;

  const facebook = document.createElement("button");
  facebook.className = "guest-app-auth-button";
  facebook.type = "button";
  facebook.textContent = labels.facebook;
  facebook.disabled = !isWebAuthProviderEnabled("facebook");

  const status = document.createElement("small");
  status.className = "guest-app-auth-status";
  status.textContent = "";
  google.addEventListener("click", () => { void startAuth("google", status); });
  facebook.addEventListener("click", () => { void startAuth("facebook", status); });

  strip.append(telegram, google, facebook, status);
};

const showAuthRequired = () => {
  const strip = document.getElementById(authStripId);
  if (!strip) return;
  const status = strip.querySelector<HTMLElement>(".guest-app-auth-status");
  if (status) status.textContent = copy[useAppStore.getState().language].required;
  strip.classList.remove("is-prompted");
  window.requestAnimationFrame(() => strip.classList.add("is-prompted"));
};

const preserveProtectedActivityIntent = (target: Element) => {
  const navigation = resolveGuestActivityAuthNavigation(target, window.location);
  if (!navigation) return;
  window.sessionStorage.setItem(activitySelectionReturnStorageKey, navigation.returnPath);
  window.history.replaceState({}, "", navigation.entryPath);
};

const handleGuestClick = (event: MouseEvent) => {
  if (!isGuestAppPath()) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const navItem = target.closest(".bottom-nav > button, .bottom-nav > a");
  if (navItem && (navItem.matches(":nth-child(4)") || navItem.matches(":nth-child(5)"))) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showAuthRequired();
    return;
  }

  if (target.closest(guestProtectedActionSelector)) {
    preserveProtectedActivityIntent(target);
    event.preventDefault();
    event.stopImmediatePropagation();
    showAuthRequired();
  }
};

const syncGuestUi = () => {
  if (typeof document === "undefined") return;
  if (!isGuestAppPath()) {
    document.documentElement.classList.remove("go-irl-guest-app");
    document.getElementById(authStripId)?.remove();
    return;
  }
  document.documentElement.classList.add("go-irl-guest-app");
  renderAuthStrip();
};

export const prepareCanonicalGuestAppRuntime = () => {
  if (typeof window === "undefined") return;
  if (!installed) {
    installed = true;
    installGuestStoreAdapter();
    document.addEventListener("click", handleGuestClick, true);
    window.addEventListener("popstate", syncGuestUi);
    unsubscribeStore = useAppStore.subscribe((state, previous) => {
      if (state.language !== previous.language) {
        renderAuthStrip();
        if (isPublicGuestServicesRoute(normalizedPath())) void loadGuestState();
      }
    });
    window.addEventListener("beforeunload", () => unsubscribeStore?.(), { once: true });
  }
  syncGuestUi();
};
