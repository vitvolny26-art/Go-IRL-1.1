import { useEffect, useState, type ReactNode } from "react";
import { Bell, CalendarPlus, Check, ChevronDown, Globe2, MapPin, UserRoundPlus } from "lucide-react";
import { useBeautyProfessionalPendingBookings } from "../beauty/useBeautyProfessionalPendingBookings";
import { cities, getCity } from "../config/cities";
import {
  contentLanguageForUi,
  getStoredUiLanguage,
  getTranslation,
  languageOptions,
  localeByLanguage,
  setUiLanguage,
  type Translation,
  type UiLanguage,
} from "../i18n";
import { requestLaunchSurface } from "../launchNavigation";
import {
  getParticipantJoinNotifications,
  markParticipantJoinNotificationsRead,
  participantNotificationsChangedEvent,
  type ParticipantJoinNotification,
} from "../participantNotifications";
import { beautyDeepLinkSlug } from "../services/beautyDeepLink";
import { useAppStore } from "../store";
import type { Language } from "../types";
import { updateUserPreferences } from "../userPreferences";

declare const __GO_IRL_COMMIT__: string;

type HeaderMenu = "city" | "language" | "notifications" | null;

type AppHeaderProps = {
  language: Language;
  selectedCityId: string;
  translation: Translation;
  authSlot?: ReactNode;
  extraControls?: ReactNode;
  onBrandClick: () => void;
  onCityChange: (cityId: string) => void;
  onLanguageChange: (language: Language) => void;
};

const notificationCopy: Record<UiLanguage, { joined: string; request: string }> = {
  ru: { joined: "Новый участник", request: "Новый запрос на участие" },
  uk: { joined: "Новий учасник", request: "Новий запит на участь" },
  cs: { joined: "Nový účastník", request: "Nová žádost o účast" },
  en: { joined: "New participant", request: "New join request" },
  pl: { joined: "Nowy uczestnik", request: "Nowa prośba o dołączenie" },
  sk: { joined: "Nový účastník", request: "Nová žiadosť o účasť" },
};

const beautyRequestCopy: Record<UiLanguage, string> = {
  ru: "Новый запрос на запись",
  uk: "Новий запит на запис",
  cs: "Nová žádost o rezervaci",
  en: "New booking request",
  pl: "Nowa prośba o rezerwację",
  sk: "Nová žiadosť o rezerváciu",
};

const notificationTitle = (notification: ParticipantJoinNotification, language: UiLanguage) => {
  const contentLanguage = contentLanguageForUi(language);
  return notification.activityTitle[contentLanguage]
    || notification.activityTitle.ru
    || Object.values(notification.activityTitle)[0]
    || "GO IRL";
};

const notificationTime = (createdAt: number, language: UiLanguage) =>
  new Intl.DateTimeFormat(localeByLanguage[language], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));

export function AppHeader({
  language,
  selectedCityId,
  authSlot,
  extraControls,
  onBrandClick,
  onCityChange,
  onLanguageChange,
}: AppHeaderProps) {
  const userRole = useAppStore((state) => state.userRole);
  const [openMenu, setOpenMenu] = useState<HeaderMenu>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [notifications, setNotifications] = useState(getParticipantJoinNotifications);
  const [uiLanguage, setHeaderUiLanguage] = useState<UiLanguage>(() => getStoredUiLanguage(language));
  const translation = getTranslation(uiLanguage);
  const selectedCity = getCity(selectedCityId);
  const selectedLanguage = languageOptions.find((item) => item.id === uiLanguage) ?? languageOptions[0];
  const servicesPath = typeof window !== "undefined"
    && window.location.pathname.replace(/\/+$/, "") === "/services";
  const beautyRequests = useBeautyProfessionalPendingBookings(contentLanguageForUi(uiLanguage), userRole, servicesPath);
  const unreadCount = notifications.filter((item) => !item.read).length + beautyRequests.length;

  useEffect(() => {
    window.dispatchEvent(new Event("go-irl-header-auth-slot-ready"));
  });

  useEffect(() => {
    const slug = beautyDeepLinkSlug(window.location.pathname, window.location.search);
    if (!slug) return;
    useAppStore.getState().setView("explore");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const previousHeaderHeight = root.style.getPropertyValue("--app-header-height");
    root.style.setProperty("--app-header-height", "84px");

    return () => {
      if (previousHeaderHeight) root.style.setProperty("--app-header-height", previousHeaderHeight);
      else root.style.removeProperty("--app-header-height");
    };
  }, []);

  useEffect(() => {
    const refreshNotifications = () => setNotifications(getParticipantJoinNotifications());
    window.addEventListener(participantNotificationsChangedEvent, refreshNotifications);
    return () => window.removeEventListener(participantNotificationsChangedEvent, refreshNotifications);
  }, []);

  const toggleMenu = (menu: Exclude<HeaderMenu, null>) => {
    setOpenMenu((current) => current === menu ? null : menu);
  };

  const toggleNotifications = () => {
    const opening = openMenu !== "notifications";
    setOpenMenu(opening ? "notifications" : null);
    if (opening) setNotifications(markParticipantJoinNotificationsRead());
  };

  const handleBrandClick = () => {
    const normalizedPath = window.location.pathname.replace(/\/+$/, "");
    if (normalizedPath) requestLaunchSurface();
    onBrandClick();
  };

  const handleLanguageChange = (nextLanguage: UiLanguage) => {
    const contentLanguage = contentLanguageForUi(nextLanguage);
    setUiLanguage(nextLanguage);
    setHeaderUiLanguage(nextLanguage);
    updateUserPreferences({ language: contentLanguage });
    onLanguageChange(contentLanguage);
    setOpenMenu(null);
  };

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <button
            className="header-brand"
            onClick={handleBrandClick}
            type="button"
            aria-label="GO IRL"
            style={{
              width: 92,
              height: 84,
              minWidth: 92,
              minHeight: 84,
              overflow: "visible",
              justifyContent: "center",
            }}
          >
            {logoFailed ? (
              <span style={{ color: "#c9ff3d", fontSize: 18, fontWeight: 950, lineHeight: 1 }}>GO IRL</span>
            ) : (
              <img
                src={`/branding/go-irl-logo.jpg?v=${encodeURIComponent(__GO_IRL_COMMIT__)}`}
                alt="GO IRL"
                onError={() => setLogoFailed(true)}
                style={{
                  display: "block",
                  width: 82,
                  height: 82,
                  borderRadius: 0,
                  objectFit: "contain",
                  boxShadow: "none",
                }}
              />
            )}
          </button>

          <div className="header-auth-slot" id="go-irl-header-auth-slot">
            {authSlot}
          </div>

          <div className="header-controls">
            {extraControls}
            <button
              className={openMenu === "city" ? "header-control city-control is-active" : "header-control city-control"}
              onClick={() => toggleMenu("city")}
              type="button"
              aria-label={translation.selectCity}
              aria-expanded={openMenu === "city"}
            >
              <MapPin />
              <span>{selectedCity.name[uiLanguage]}</span>
              <ChevronDown className="control-chevron" />
            </button>

            <button
              className={openMenu === "language" ? "header-control language-control is-active" : "header-control language-control"}
              onClick={() => toggleMenu("language")}
              type="button"
              aria-label={translation.selectLanguage}
              aria-expanded={openMenu === "language"}
            >
              <Globe2 />
              <span style={{ fontSize: 10 }}>{selectedLanguage.shortLabel}</span>
              <ChevronDown className="control-chevron" />
            </button>

            <button
              className={openMenu === "notifications" ? "header-icon-button is-active" : "header-icon-button"}
              onClick={toggleNotifications}
              type="button"
              aria-label={`${translation.notifications}${unreadCount ? ` (${unreadCount})` : ""}`}
              aria-expanded={openMenu === "notifications"}
              title={translation.notifications}
            >
              <Bell />
              {unreadCount ? <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
            </button>
          </div>

          {openMenu === "city" && (
            <div className="header-popover city-popover" role="menu" aria-label={translation.selectCity}>
              <div className="popover-title">{translation.selectCity}</div>
              {cities.map((city) => (
                <button key={city.id} onClick={() => { onCityChange(city.id); setOpenMenu(null); }} type="button" role="menuitem">
                  <span className="option-icon"><MapPin /></span>
                  <span><strong>{city.name[uiLanguage]}</strong><small>{city.countryCode}</small></span>
                  {city.id === selectedCityId && <Check />}
                </button>
              ))}
            </div>
          )}

          {openMenu === "language" && (
            <div className="header-popover language-popover" role="menu" aria-label={translation.selectLanguage}>
              <div className="popover-title">{translation.selectLanguage}</div>
              {languageOptions.map((option) => (
                <button key={option.id} onClick={() => handleLanguageChange(option.id)} type="button" role="menuitem">
                  <span className="language-code">{option.shortLabel}</span>
                  <strong>{option.name}</strong>
                  {option.id === uiLanguage && <Check />}
                </button>
              ))}
            </div>
          )}

          {openMenu === "notifications" && (
            <div className="header-popover notifications-popover" role="status">
              <div className="popover-title">{translation.notifications}</div>
              {beautyRequests.length || notifications.length ? (
                <div className="notification-list">
                  {beautyRequests.map((booking) => (
                    <a className="notification-item is-unread notification-beauty-request" href="/beauty/workspace" key={`beauty:${booking.id}`}>
                      <span className="notification-item-icon"><CalendarPlus /></span>
                      <span className="notification-item-copy">
                        <strong>{beautyRequestCopy[uiLanguage]}: {booking.clientName}</strong>
                        <span>{booking.serviceName} · {booking.date} · {booking.time}</span>
                        <small>{notificationTime(new Date(booking.createdAt).getTime(), uiLanguage)}</small>
                      </span>
                    </a>
                  ))}
                  {notifications.map((notification) => (
                    <div className={notification.read ? "notification-item" : "notification-item is-unread"} key={notification.id}>
                      <span className="notification-item-icon"><UserRoundPlus /></span>
                      <span className="notification-item-copy">
                        <strong>{notificationCopy[uiLanguage][notification.kind || "joined"]}: {notification.memberName}</strong>
                        <span>{notificationTitle(notification, uiLanguage)}</span>
                        <small>{notificationTime(notification.createdAt, uiLanguage)}</small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="notification-empty"><Bell /><span>{translation.noNotifications}</span></div>
              )}
            </div>
          )}
        </div>
      </header>
      {openMenu && <button className="header-scrim" onClick={() => setOpenMenu(null)} type="button" aria-label={translation.close} />}
    </>
  );
}
