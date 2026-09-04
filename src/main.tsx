import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { activityOptions } from "./data";
import { enableFullCreateTaxonomy } from "./fullCreateTaxonomy";
import { getActivityIconAsset, getCategoryIconAsset } from "./activityIconAssets";
import { enableParticipantJoinNotifications } from "./participantNotifications";
import { enableMapyRuntimeLinks } from "./mapyRuntimeLinks";
import { enableActivity3dIcons } from "./enableActivity3dIcons";
import { enableUxRegressionPack } from "./uxRegressionPack";
import { enableCardParticipantsDropdown } from "./cardParticipantsDropdown";
import { enableSportEventCardPolicy } from "./sportEventCardPolicy";
import { enableUnifiedEventPrimaryControls } from "./unifiedEventPrimaryControls";
import { OrganizerProfilePortal } from "./components/OrganizerProfilePortal";
import { OrganizerEventDetailsPortal } from "./components/OrganizerEventDetailsPortal";
import { EventLocationPickerPortal } from "./components/EventLocationPickerPortal";
import { EventLocationProviderPortal } from "./components/EventLocationProviderPortal";
import { MapProviderPickerPortal } from "./components/MapProviderPickerPortal";
import { ParticipantIdentityPortal } from "./components/ParticipantIdentityPortal";
import { FirstOnboardingGate } from "./onboarding/FirstOnboardingGate";
import { DevPanel, shouldShowAdminDevPanel } from "./components/DevPanel";
import { resolveAdminRoute } from "./admin/adminSession";
import { isProfilePath } from "./profile/profileRoute";
import { useAppStore } from "./store";
import { resolveLaunchSurface, type LaunchSurface } from "./launchSurface";
import { applyGoIrlLaunchContext, resolveGoIrlLaunchContext } from "./clientSurface";
import "./styles.css";
import "./category-cards.css";
import "./activity-3d-icons.css";
import "./mobile-card-fixes.css";
import "./coach-panel.css";
import "./weather-ui-fixes.css";
import "./generic-sheet-fixes.css";
import "./compact-sport-card.css";
import "./compact-sport-card-final.css";
import "./all-event-card-template.css";
import "./unified-card-actions.css";
import "./card-share-action.css";
import "./glass-event-card.css";
import "./glass-event-card-polish.css";
import "./glass-event-card-borderless-v4.css";
import "./event-card-control-spacing-v7.css";
import "./event-card-control-v8.css";
import "./sport-organizer-card-labels.css";
import "./avatar-cropper.css";
import "./participant-notifications.css";
import "./profile-avatar-proportions.css";
import "./organizer-event-details.css";
import "./profile011-organizer-favorites.css";
import "./event-location-picker.css";
import "./event-location-provider.css";
import "./map-provider-picker.css";
import "./profile-preferences.css";
import "./participant-identity.css";
import "./onboarding/first-onboarding.css";
import "./profile-hub.css";
import "./mobile-ux-followup.css";
import "./event-main-block.css";
import "./sport-metadata-compact-location.css";
import "./ux-regression-pack.css";
import "./card-participants-dropdown.css";
import "./sport-event-card-policy.css";
import "./unified-event-primary-controls.css";
import "./event-sheet-priority-layout.css";
import "./event-sheet-production-fix.css";
import "./services/service-activity-card-overrides.css";
import "./services/beauty-share-priority-fix.css";
import "./beauty/beauty-booking-notice-overrides.css";
import "./responsive-shell.css";

type SupportedLanguage = "ru" | "uk" | "cs" | "en";
type StoredPreferences = { language?: SupportedLanguage; cityId?: string; mapProvider?: "google" | "apple" | "mapy" };
type TelegramUserWithLanguage = { language_code?: string };

const supportedLanguages = new Set<SupportedLanguage>(["ru", "uk", "cs", "en"]);
const preferencesStorageKey = "go-irl-user-preferences";
const legacyLanguageStorageKey = "go-irl-language";
const createIconPickerSelector = '.create-form select[name="categoryId"], .create-form select[name="activityText"]';
const createIconPickerSync = new WeakMap<HTMLSelectElement, () => void>();
let createIconPickerSequence = 0;

const normalizeDeviceLanguage = (value: string | undefined): SupportedLanguage | null => {
  const code = value?.trim().toLowerCase().split(/[-_]/)[0] as SupportedLanguage | undefined;
  return code && supportedLanguages.has(code) ? code : null;
};

const readStoredPreferences = (): StoredPreferences => {
  try {
    const parsed = JSON.parse(localStorage.getItem(preferencesStorageKey) || "null") as StoredPreferences | null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const initializeLanguagePreference = () => {
  const preferences = readStoredPreferences();
  const storedUnifiedLanguage = preferences.language && supportedLanguages.has(preferences.language) ? preferences.language : null;
  const storedLegacyLanguage = normalizeDeviceLanguage(localStorage.getItem(legacyLanguageStorageKey) || undefined);
  const storedLanguage = storedUnifiedLanguage || storedLegacyLanguage;
  if (storedLanguage) {
    localStorage.setItem(legacyLanguageStorageKey, storedLanguage);
    if (preferences.language !== storedLanguage) localStorage.setItem(preferencesStorageKey, JSON.stringify({ ...preferences, language: storedLanguage }));
    useAppStore.setState({ language: storedLanguage });
    return;
  }
  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user as TelegramUserWithLanguage | undefined;
  const telegramLanguage = normalizeDeviceLanguage(telegramUser?.language_code);
  const browserLanguage = navigator.languages.map((language) => normalizeDeviceLanguage(language)).find((language): language is SupportedLanguage => Boolean(language));
  const language = telegramLanguage || browserLanguage || "en";
  localStorage.setItem(legacyLanguageStorageKey, language);
  localStorage.setItem(preferencesStorageKey, JSON.stringify({ ...preferences, language }));
  useAppStore.setState({ language });
};

const cleanActivityLabel = (value: string) => value.replace(/^(?:\s|\u200d|\ufe0f|\p{Extended_Pictographic})+/u, "").trim();

const resolveActivityIconFromLabel = (label: string) => {
  const cleanLabel = cleanActivityLabel(label);
  for (const options of Object.values(activityOptions)) {
    const option = options.find((item) => Object.values(item.name).some((name) => name === cleanLabel));
    if (option) return getActivityIconAsset(option.icon, cleanLabel);
  }
  return null;
};

const optionIconSource = (select: HTMLSelectElement, option: HTMLOptionElement) => {
  if (select.name === "categoryId") return getCategoryIconAsset(option.value);
  return option.dataset.activityIconSrc || resolveActivityIconFromLabel(option.textContent || option.value);
};

const ensureCreateIconPickerStyles = () => {
  if (document.getElementById("go-irl-create-icon-picker-styles")) return;
  const style = document.createElement("style");
  style.id = "go-irl-create-icon-picker-styles";
  style.textContent = `
    .create-form select.create-icon-native-select {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      margin: 0 !important;
      padding: 0 !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .create-icon-picker { position: relative; width: 100%; }
    .create-icon-picker-trigger,
    .create-icon-picker-option {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) 18px;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 58px;
      padding: 7px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface-2);
      color: var(--text);
      text-align: left;
    }
    .create-icon-picker-trigger img,
    .create-icon-picker-option img {
      width: 42px;
      height: 42px;
      border-radius: 9px;
      object-fit: cover;
      box-shadow: none;
    }
    .create-icon-picker-trigger span,
    .create-icon-picker-option span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 800;
    }
    .create-icon-picker-chevron { color: var(--muted); font-size: 18px; text-align: center; }
    .create-icon-picker-menu {
      position: absolute;
      z-index: 140;
      top: calc(100% + 6px);
      right: 0;
      left: 0;
      display: grid;
      gap: 5px;
      max-height: min(52vh, 380px);
      overflow-y: auto;
      padding: 7px;
      border: 1px solid #30343c;
      border-radius: 12px;
      background: #14161b;
      box-shadow: 0 22px 64px rgba(0,0,0,.58);
      overscroll-behavior: contain;
    }
    .create-icon-picker-menu[hidden] { display: none; }
    .create-icon-picker-option { border-color: transparent; background: transparent; }
    .create-icon-picker-option:hover,
    .create-icon-picker-option:focus-visible,
    .create-icon-picker-option[aria-selected="true"] { background: #242830; outline: none; }
    .create-icon-picker-option[aria-selected="true"] { border-color: rgba(201,255,61,.45); }
  `;
  document.head.append(style);
};

const enhanceCreateIconSelect = (select: HTMLSelectElement) => {
  const signature = Array.from(select.options).map((option) => `${option.value}:${option.textContent || ""}`).join("|");
  const previousSignature = select.dataset.createIconPickerSignature;
  if (select.dataset.createIconPickerProcessed === "true" && previousSignature === signature) {
    return;
  }

  if (select.dataset.createIconPickerId) {
    document.querySelector(`[data-create-icon-picker-for="${select.dataset.createIconPickerId}"]`)?.remove();
  }

  const pickerId = `go-irl-create-icon-picker-${++createIconPickerSequence}`;
  const root = document.createElement("div");
  root.className = "create-icon-picker";
  root.dataset.createIconPickerFor = pickerId;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "create-icon-picker-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "create-icon-picker-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");

  const renderTrigger = () => {
    const option = select.selectedOptions[0] || select.options[0];
    if (!option) return;
    const src = optionIconSource(select, option);
    trigger.replaceChildren();
    if (src) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = "";
      image.decoding = "async";
      trigger.append(image);
    } else {
      trigger.append(document.createElement("span"));
    }
    const label = document.createElement("span");
    label.textContent = cleanActivityLabel(option.textContent || option.value);
    trigger.append(label);
    const chevron = document.createElement("span");
    chevron.className = "create-icon-picker-chevron";
    chevron.textContent = "⌄";
    trigger.append(chevron);
    Array.from(menu.querySelectorAll<HTMLButtonElement>(".create-icon-picker-option")).forEach((button) => {
      button.setAttribute("aria-selected", button.dataset.value === select.value ? "true" : "false");
    });
  };

  Array.from(select.options).forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "create-icon-picker-option";
    button.setAttribute("role", "option");
    button.dataset.value = option.value;
    const src = optionIconSource(select, option);
    if (src) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = "";
      image.decoding = "async";
      image.loading = "lazy";
      button.append(image);
    } else {
      button.append(document.createElement("span"));
    }
    const label = document.createElement("span");
    label.textContent = cleanActivityLabel(option.textContent || option.value);
    button.append(label);
    button.append(document.createElement("span"));
    button.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      window.requestAnimationFrame(renderTrigger);
    });
    menu.append(button);
  });

  trigger.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    trigger.setAttribute("aria-expanded", menu.hidden ? "false" : "true");
  });
  select.addEventListener("change", renderTrigger);
  root.append(trigger, menu);
  select.classList.add("create-icon-native-select");
  select.dataset.createIconPickerProcessed = "true";
  select.dataset.createIconPickerSignature = signature;
  select.dataset.createIconPickerId = pickerId;
  select.insertAdjacentElement("afterend", root);
  createIconPickerSync.set(select, renderTrigger);
  renderTrigger();
};

const processCreateIconSelects = () => {
  ensureCreateIconPickerStyles();
  document.querySelectorAll<HTMLSelectElement>(createIconPickerSelector).forEach(enhanceCreateIconSelect);
  document.querySelectorAll<HTMLElement>(".create-icon-picker[data-create-icon-picker-for]").forEach((picker) => {
    const pickerId = picker.dataset.createIconPickerFor;
    if (!pickerId || !document.querySelector(`select[data-create-icon-picker-id="${pickerId}"]`)) picker.remove();
  });
};

const enableCreateIconSelects = () => {
  processCreateIconSelects();
  const observer = new MutationObserver(processCreateIconSelects);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    document.querySelectorAll<HTMLElement>(".create-icon-picker").forEach((picker) => {
      if (picker.contains(event.target as Node)) return;
      const menu = picker.querySelector<HTMLElement>(".create-icon-picker-menu");
      const trigger = picker.querySelector<HTMLElement>(".create-icon-picker-trigger");
      if (menu) menu.hidden = true;
      trigger?.setAttribute("aria-expanded", "false");
    });
    window.requestAnimationFrame(() => {
      document.querySelectorAll<HTMLSelectElement>(createIconPickerSelector).forEach((select) => createIconPickerSync.get(select)?.());
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll<HTMLElement>(".create-icon-picker-menu").forEach((menu) => { menu.hidden = true; });
    document.querySelectorAll<HTMLElement>(".create-icon-picker-trigger").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
  });
  return () => observer.disconnect();
};

initializeLanguagePreference();
applyGoIrlLaunchContext(document.documentElement, resolveGoIrlLaunchContext({
  telegram: window.Telegram,
  search: window.location.search,
  userAgent: navigator.userAgent,
}));
enableFullCreateTaxonomy();
const App = lazy(() => import("./App"));
const LaunchPage = lazy(() => import("./LaunchPage").then((module) => ({ default: module.LaunchPage })));
const AdminLoginPage = lazy(() => import("./admin/AdminLoginPage").then((module) => ({ default: module.AdminLoginPage })));
const AdminAccessDeniedPage = lazy(() => import("./admin/AdminLoginPage").then((module) => ({ default: module.AdminAccessDeniedPage })));
const AdminPanelPage = lazy(() => import("./admin/AdminLoginPage").then((module) => ({ default: module.AdminPanelPage })));
const BeautySetupPage = lazy(() => import("./beauty/BeautySetupPage").then((module) => ({ default: module.BeautySetupPage })));
const BeautyRouteGuard = lazy(() => import("./beauty/BeautyRouteGuard").then((module) => ({ default: module.BeautyRouteGuard })));
const BeautyMasterClaimPage = lazy(() => import("./beauty/BeautyMasterClaimPage").then((module) => ({ default: module.BeautyMasterClaimPage })));
const UserCommunicationPreferenceGate = lazy(() => import("./communications/UserCommunicationPreferenceGate").then((module) => ({ default: module.UserCommunicationPreferenceGate })));
const ServicesCatalogView = lazy(() => import("./services/ServicesClientViews").then((module) => ({ default: module.ServicesCatalogView })));
const ServicesExperiencePortals = lazy(() => import("./services/ServicesExperiencePortals").then((module) => ({ default: module.ServicesExperiencePortals })));
const queryClient = new QueryClient();
const adminRoute = resolveAdminRoute(window.location.pathname);
const beautyPath = window.location.pathname.replace(/\/+$/, "");
const beautyRoute = beautyPath === "/beauty" || beautyPath === "/beauty/workspace";
const beautyClaimRoute = beautyPath === "/beauty/claim";
const masterPublicRoute = beautyPath === "/masters" || /^\/master\/[^/]+(?:\/(?:ru|uk|cs|en))?$/i.test(beautyPath);

if (!adminRoute && !beautyRoute && isProfilePath(window.location.pathname)) {
  useAppStore.setState({ view: "profile" });
}

enableParticipantJoinNotifications();
enableMapyRuntimeLinks();
enableUxRegressionPack();
enableCardParticipantsDropdown();
enableSportEventCardPolicy();
enableUnifiedEventPrimaryControls();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/service-worker.js").catch(() => undefined); });
}

const adminSurface = adminRoute === "login"
  ? <AdminLoginPage />
  : adminRoute === "denied"
    ? <AdminAccessDeniedPage />
    : adminRoute === "panel"
      ? <AdminPanelPage />
      : null;

function AdminDevPanel() {
  const userRole = useAppStore((state) => state.userRole);
  return shouldShowAdminDevPanel(userRole) ? <DevPanel /> : null;
}

const readLaunchSurface = () => resolveLaunchSurface({
  pathname: window.location.pathname,
  hash: window.location.hash,
  search: window.location.search,
  telegramStartParam: window.Telegram?.WebApp?.initDataUnsafe?.start_param,
});

function MainSurface() {
  const language = useAppStore((state) => state.language);
  const selectedCityId = useAppStore((state) => state.selectedCityId);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const setSelectedCity = useAppStore((state) => state.setSelectedCity);
  const [surface, setSurface] = useState<LaunchSurface>(readLaunchSurface);

  useEffect(() => {
    const syncSurface = () => setSurface(readLaunchSurface());
    window.addEventListener("hashchange", syncSurface);
    window.addEventListener("popstate", syncSurface);
    return () => {
      window.removeEventListener("hashchange", syncSurface);
      window.removeEventListener("popstate", syncSurface);
    };
  }, []);

  const openApp = (path: "/activities" | "/services") => {
    window.history.pushState(null, "", path);
    setSurface("app");
  };

  if (surface === "launch") {
    return (
      <>
        <LaunchPage
          language={language}
          selectedCityId={selectedCityId}
          onLanguageChange={setLanguage}
          onCityChange={setSelectedCity}
          onOpenActivities={() => openApp("/activities")}
          onOpenServices={() => openApp("/services")}
        />
        <AdminDevPanel />
      </>
    );
  }

  if (masterPublicRoute) {
    return (
      <QueryClientProvider client={queryClient}>
        <main className="app">
          <Suspense fallback={<div className="app-shell-loading">GO IRL</div>}>
            <ServicesCatalogView language={language} selectedCityId={selectedCityId} />
          </Suspense>
        </main>
        <Suspense fallback={null}><ServicesExperiencePortals /></Suspense>
        <AdminDevPanel />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div className="app-shell-loading">GO IRL</div>}><App /></Suspense>
      <FirstOnboardingGate />
      <Suspense fallback={null}><ServicesExperiencePortals /></Suspense>
      <OrganizerProfilePortal />
      <OrganizerEventDetailsPortal />
      <EventLocationPickerPortal />
      <EventLocationProviderPortal />
      <MapProviderPickerPortal />
      <ParticipantIdentityPortal />
      <AdminDevPanel />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<div className="app-shell-loading">GO IRL</div>}>
      {adminSurface || (beautyClaimRoute ? <BeautyMasterClaimPage /> : beautyRoute ? <BeautyRouteGuard><BeautySetupPage /></BeautyRouteGuard> : (
        <>
          <MainSurface />
          <Suspense fallback={null}><UserCommunicationPreferenceGate /></Suspense>
        </>
      ))}
    </Suspense>
  </StrictMode>,
);

enableActivity3dIcons();
enableCreateIconSelects();
