import { useEffect, useRef, useState } from "react";
import { CalendarDays, CalendarPlus, Check, ChevronRight, CircleUserRound, Clock3, Bug, Ellipsis, MapPin, Pencil, ShieldCheck, Sparkles, Thermometer, Ticket, Trash2, Umbrella, UsersRound, Wind, X } from "lucide-react";
import { getTranslation, localeByLanguage } from "../i18n";
import { openBugReport } from "../bugReport";
import { getEventWeather, type WeatherHour, type WeatherResult } from "../services/weather";
import { formatEventTime } from "../eventTime";
import { useAppStore } from "../store";
import { getUserKey } from "../supabase";
import type { Activity, Language, SportMetadata } from "../types";
import { getSportMetadata, sportEnvironmentLabel, sportEnvironments, sportFormatLabel, sportFormats, sportLevelLabel, sportLevels } from "./sport";
import { ActivityChatPanel } from "../components/ActivityChatPanel";
import { EventCardMetaItem, EventDetailsAction, OrganizerAvatarAction, OrganizerDetailAction, ParticipantProfileAction } from "../components/EventCardPrimitives";
import { CoachRequestPanel } from "../components/CoachRequestPanel";
import { getOrganizerRoleRequestState } from "../coachFeature";
import { getCity } from "../config/cities";
import { buildGoogleCalendarUrl } from "../calendar/googleCalendar";
import { getTelegramWebApp } from "../telegram";
import { CardShareAction } from "../components/CardShareAction";
import { CardReminderAction } from "../components/CardReminderAction";
import { EventCardArtwork } from "../components/EventCardArtwork";
import { ActivityIcon } from "../components/ActivityIcon";
import { stripLeadingEmoji } from "../cardText";
import { activityIconFromText } from "../activityIcon";
import { buildBrowserActivityInviteUrl, buildTelegramActivityInviteUrl } from "../invitationLink";
import { sharePreparedTelegramEvent } from "../telegramPreparedShare";
import {
  eventActionTranslationKey,
  isActivityFinished,
  resolveEventInteractionState,
  runEventPrimaryAction,
} from "../eventInteractionState";
import { eventDurationLabel } from "../eventCardPresentation";
import { buildDurationOptions, formatDurationOption } from "../durationOptions";
import { getEventSheetBackgroundStyle } from "../eventSheetBackground";
import { joinedParticipants } from "../cardParticipantsDropdown";

type CoachRequestsChangedDetail = { activityId?: string };

const coachRequestsChangedEvent = "go-irl-coach-requests-changed";
const telegramBotUsername = String(import.meta.env.VITE_GO_IRL_BOT_USERNAME || "GOirl_bot").replace(/^@/, "");
const telegramAppName = String(import.meta.env.VITE_GO_IRL_APP_NAME || "").replace(/^\//, "");

const activityInviteUrl = (activity: Activity) => {
  return buildTelegramActivityInviteUrl(activity.id, telegramBotUsername, telegramAppName)
    || buildBrowserActivityInviteUrl(activity.id, window.location.origin);
};

const openActivityMap = (activity: Activity) => {
  if (activity.locationUrl?.trim()) {
    window.open(activity.locationUrl, "_blank", "noopener,noreferrer");
    return;
  }
  const city = getCity(activity.cityId).name.en;
  const query = encodeURIComponent(activity.address.trim() || city);
  window.open(`https://mapy.cz/zakladni?q=${query}`, "_blank", "noopener,noreferrer");
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

const coachCardCopy: Record<Language, { needed: string; requested: string; confirmed: string }> = {
  ru: { needed: "Нужен тренер", requested: "Тренер запрошен", confirmed: "Есть тренер" },
  uk: { needed: "Потрібен тренер", requested: "Тренера запитано", confirmed: "Є тренер" },
  cs: { needed: "Potřebujeme trenéra", requested: "Trenér vyžádán", confirmed: "Trenér potvrzen" },
  en: { needed: "Coach needed", requested: "Coach requested", confirmed: "Coach confirmed" },
};

const cleanSportLabel = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  return stripLeadingEmoji(raw) || "Спорт";
};

const buildMapsQuery = (parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).map((part) => String(part).trim()).filter(Boolean).join(", ");

const buildGoogleMapsSearchUrl = (query: string) =>
  query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
const escapeRegExp = (value: string) => value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
const compactAddressLines = (address: string, cityName: string) => {
  const city = cityName.trim() ? new RegExp(escapeRegExp(cityName.trim()), "giu") : null;
  return address.split(/\r?\n|,\s*/).map(part => city ? part.replace(city, "") : part)
    .map(part => part.replace(/^[\s,·–—-]+|[\s,·–—-]+$/g, "").trim()).filter(Boolean).slice(0, 2);
};

const weatherSummaryLines = (weather: WeatherResult) => [
  <span key="temperature"><Thermometer aria-hidden="true" /><span>{weather.temperature}°C</span></span>,
  <span key="rain"><Umbrella aria-hidden="true" /><span>{weather.rain}%</span></span>,
  <span key="wind"><Wind aria-hidden="true" /><span>{weather.wind} km/h</span></span>,
];
const weatherSummaryText = (weather: WeatherResult) =>
  [`${weather.temperature}°C`, `${weather.rain}%`, `${weather.wind} km/h`].join(" · ");

const sportAvatar = (value: string | null | undefined) => {
  return activityIconFromText(String(value || ""), "🏆");
};

const sportAvatarForActivity = (activity: Activity, language: Language, meta: SportMetadata) =>
  sportAvatar([meta.sportType, activity.activity[language], activity.title[language]].filter(Boolean).join(" "));

const normalizeActivityMembers = (activity: Activity) => {
  const joinedMembers = joinedParticipants(activity);
  return {
    joinedMembers,
    waitingMembers: activity.members.filter((member) => member.status === "waiting"),
    pendingMembers: activity.members.filter((member) => member.status === "pending"),
    participantCount: Math.max(activity.participants, joinedMembers.length),
  };
};

type SportCardProps = {
  activity: Activity;
  language: Language;
  onOpen: (activity: Activity, options?: { focusChat?: boolean; focusRequests?: boolean }) => void;
  onJoin: (activity: Activity) => void;
  onOpenMembers?: (activity: Activity) => void;
};

type SportSheetProps = {
  activity: Activity;
  language: Language;
  cityName: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onJoin: (activity: Activity) => void;
  onCalendar: (activity: Activity) => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
  onCloseMiniApp: () => void;
  initialMembersOpen?: boolean;
  initialChatRequest?: number;
};

export function SportCreateFields({ language, initialSport }: { language: Language; initialSport: SportMetadata }) {
  const t = getTranslation(language);
  const initialDuration = initialSport.durationMinutes || 90;
  const durationOptions = buildDurationOptions(initialDuration);
  return (
    <div className="sport-create-panel">
      <div className="sport-panel-title"> {t.sportVertical}</div>
      <div className="form-row">
        <label><span>{t.sportLevel}</span><select name="sportLevel" defaultValue={initialSport.level || "intermediate"}>{sportLevels.map((level) => <option key={level.id} value={level.id}>{level.label[language]}</option>)}</select></label>
        <label><span>{t.sportFormat}</span><select name="sportFormat" defaultValue={initialSport.format || "casual"}>{sportFormats.map((format) => <option key={format.id} value={format.id}>{format.label[language]}</option>)}</select></label>
      </div>
      <div className="form-row">
        <label><span>{t.sportEnvironment}</span><select name="sportEnvironment" defaultValue={initialSport.environment || "outdoor"}>{sportEnvironments.map((environment) => <option key={environment.id} value={environment.id}>{environment.label[language]}</option>)}</select></label>
        <label><span>{t.sportDuration}</span><select name="sportDuration" defaultValue={String(initialDuration)}>{durationOptions.map((minutes) => <option key={minutes} value={minutes}>{formatDurationOption(minutes, language)}</option>)}</select></label>
      </div>
      <label className="sport-check"><input name="sportEquipmentNeeded" type="checkbox" defaultChecked={Boolean(initialSport.equipmentNeeded)} /><span>{t.sportEquipmentNeeded}</span></label>
      <label><span>{t.sportEquipment}</span><input name="sportEquipment" defaultValue={initialSport.equipment} placeholder={t.sportEquipmentPlaceholder} /></label>
      <label><span>{t.sportBring}</span><input name="sportBring" defaultValue={initialSport.bring} placeholder={t.sportBringPlaceholder} /></label>
      <label><span>{t.sportRequirements}</span><input name="sportRequirements" defaultValue={initialSport.requirements} placeholder={t.sportRequirementsPlaceholder} /></label>
      <label><span>{t.sportOrganizerTips}</span><textarea name="sportOrganizerTips" rows={3} defaultValue={initialSport.organizerTips} placeholder={t.sportOrganizerTipsPlaceholder} /></label>
    </div>
  );
}

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

const dateLabel = (date: string, language: Language) =>
  new Intl.DateTimeFormat(localeByLanguage[language], {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T12:00:00`));

function SportDetailsSkeleton() {
  return (
    <div className="details-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function SportActivityCard({ activity, language, onOpen, onJoin }: SportCardProps) {
  const { joinedIds, waitingIds, pendingIds } = useAppStore();
  const t = getTranslation(language);
  const meta = getSportMetadata(activity);
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
  const durationLabel = eventDurationLabel(meta.durationMinutes, t.minutesShort);
  const [coachState, setCoachState] = useState<"none" | "requested" | "confirmed">("none");
  const avatar = sportAvatarForActivity(activity, language, meta);
  const cityName = getCity(activity.cityId).name[language];
  const mapLabel = (activity.address.trim() || cityName).replace(/\bOlomouc\b/giu, cityName);
  const coachAction = isOrganizer
    ? coachState === "confirmed"
      ? coachCardCopy[language].confirmed
      : coachState === "requested"
        ? coachCardCopy[language].requested
        : coachCardCopy[language].needed
    : coachState === "confirmed"
      ? coachCardCopy[language].confirmed
      : t.details;
  const showCoachAction = interaction.showHelperAction && (isOrganizer || coachState === "confirmed");
  const shareTitle = cleanSportLabel(activity.activity[language]);
  const shareDate = `${compactDateLabel(activity.date, language)}${formatEventTime(activity.time) ? ` · ${formatEventTime(activity.time)}` : ""}`;
  useEffect(() => {
    let active = true;

    const refreshConfirmedCoach = () => {
      void getOrganizerRoleRequestState(activity.id)
        .then((state) => {
          if (active) setCoachState(state);
        })
        .catch(() => {
          if (active) setCoachState("none");
        });
    };

    const handleCoachRequestsChanged = (event: Event) => {
      const detail = (event as CustomEvent<CoachRequestsChangedDetail>).detail;
      if (detail?.activityId && detail.activityId !== activity.id) return;

      refreshConfirmedCoach();
    };

    refreshConfirmedCoach();
    window.addEventListener(coachRequestsChangedEvent, handleCoachRequestsChanged);

    return () => {
      active = false;
      window.removeEventListener(coachRequestsChangedEvent, handleCoachRequestsChanged);
    };
  }, [activity.id]);

  return (
    <article className="sport-card compact-sport-card unified-event-card glass-event-card">
      <EventCardArtwork icon={avatar} activity={activity.activity[language]} title={activity.title[language]} />
      <div className="sport-card-top-actions">
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
      <div className="sport-chip-row" aria-label={`${sportLevelLabel(meta.level, language)} | ${sportEnvironmentLabel(meta.environment, language)} | ${durationLabel}`}>
        <span className="sport-card-chip sport-level-chip">{sportLevelLabel(meta.level, language)}</span>
        <span className="sport-card-chip sport-environment-chip">{sportEnvironmentLabel(meta.environment, language)}</span>
        {durationLabel ? <span className="sport-card-chip sport-duration-chip">{durationLabel}</span> : null}
      </div>
      <div className="activity-card-details sport-details-grid">
        <EventCardMetaItem icon={<CalendarDays />} caption={t.date} value={shareDate} ariaLabel={t.addToGoogleCalendar} onClick={() => openActivityCalendar(activity, language)} />
        <EventCardMetaItem icon={<Ticket />} caption={t.price.split(",")[0]} value={activity.price ? `${activity.price} Kč` : t.free} />
        <EventCardMetaItem icon={<MapPin />} caption={t.address} value={mapLabel} ariaLabel={`${t.address}: ${mapLabel}`} onClick={() => openActivityMap(activity)} />
        <OrganizerAvatarAction organizerKey={activity.organizerKey} organizerName={activity.organizer} />
      </div>
      <div className="activity-card-footer compact-sport-actions">
        {joined
          ? <button className="sport-coach-action" onClick={handleCardLeftAction} type="button"><span>{cardLeftLabel}</span></button>
          : showCoachAction
            ? <button className="sport-coach-action sport-coach-action-wrap" onClick={() => onOpen(activity)} type="button"><span>{coachAction}</span></button>
            : <EventDetailsAction label={t.details} onClick={() => onOpen(activity)} />}
        <button className={membershipActive ? "card-join card-leave" : interaction.canJoin && !pending ? "card-join" : "card-join secondary"} onClick={handleCardRightAction} type="button" disabled={cardRightDisabled}>{cardRightLabel}</button>
      </div>
    </article>
  );
}

export function SportActivitySheet({
  activity,
  language,
  cityName,
  loading,
  error,
  onClose,
  onJoin,
  onCalendar,
  onEdit,
  onDelete,
  onCloseMiniApp,
  initialMembersOpen = false,
  initialChatRequest = 0,
}: SportSheetProps) {
  const { joinedIds, waitingIds, pendingIds, userRole, reviewRequest } = useAppStore();
  const [membersOpen, setMembersOpen] = useState(initialMembersOpen);
  const [chatOpenRequest, setChatOpenRequest] = useState(initialChatRequest);
  const moreActionsRef = useRef<HTMLDetailsElement>(null);
  const t = getTranslation(language);
  const shareTitle = stripLeadingEmoji(activity.activity[language]);
  const shareDate = `${compactDateLabel(activity.date, language)}${formatEventTime(activity.time) ? ` · ${formatEventTime(activity.time)}` : ""}`;
  const [weatherText, setWeatherText] = useState(t.weatherPlaceholder);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [weatherHours, setWeatherHours] = useState<WeatherHour[]>([]);
  const [weatherDetailsOpen, setWeatherDetailsOpen] = useState(false);
  const meta = getSportMetadata(activity);
  const showWeather = meta.environment === "outdoor";
  const isOrganizer = activity.organizerKey === getUserKey();
  const canDelete = isOrganizer || userRole === "admin";
  const canManageActivity = isOrganizer || userRole === "admin" || userRole === "moderator";
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
  const { joinedMembers, waitingMembers, pendingMembers, participantCount } = normalizeActivityMembers(activity);
  const sportMapQuery = buildMapsQuery([activity.address, cityName]);
  const sportMapSearchUrl = buildGoogleMapsSearchUrl(sportMapQuery);
  const addressLines = compactAddressLines(activity.address, cityName);
  const avatar = sportAvatarForActivity(activity, language, meta);
  const sheetBackgroundStyle = getEventSheetBackgroundStyle({
    icon: avatar,
    activity: meta.sportType || activity.activity[language],
    title: activity.title[language],
  });

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

  useEffect(() => {
    let active = true;

    if (!showWeather) {
      setWeatherText("");
      setWeather(null);
      setWeatherHours([]);
      setWeatherDetailsOpen(false);
      return;
    }

    const days = Math.round((new Date(`${activity.date}T12:00:00`).getTime() - new Date(new Date().setHours(12, 0, 0, 0)).getTime()) / 86400000);

    if (days > 7) {
      setWeatherText(t.weatherAvailableSoon);
      setWeather(null);
      setWeatherHours([]);
      return;
    }

    setWeatherText(t.weatherLoading);
    setWeather(null);
    setWeatherHours([]);
    void getEventWeather({ date: activity.date, time: activity.time, address: activity.address, city: cityName, durationMinutes: meta.durationMinutes || 90 })
      .then((nextWeather) => {
        if (!active) return;
        setWeather(nextWeather);
        setWeatherText(nextWeather?.text || t.weatherUnavailable);
        setWeatherHours(nextWeather?.hours || []);
      });

    return () => {
      active = false;
    };
  }, [activity.id, activity.date, activity.time, activity.address, cityName, showWeather, meta.durationMinutes, t.weatherAvailableSoon, t.weatherLoading, t.weatherUnavailable]);

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
      <article className="activity-sheet sport-sheet" style={sheetBackgroundStyle} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <button className="sheet-close" onClick={onClose} type="button" aria-label={t.close}><X /></button>
        {loading && <SportDetailsSkeleton />}
        {error && <div className="details-error"><ShieldCheck /><span>{t.databaseError}</span></div>}
        <div className="sport-sheet-hero">
          <div className="sport-card-symbol large">
            <ActivityIcon emoji={avatar} label={activity.activity[language]} />
          </div>
          <div>
            <div className="sport-eyebrow">{sportEnvironmentLabel(meta.environment, language)}</div>
            <h2>{stripLeadingEmoji(activity.title[language])}</h2>
            <p>{stripLeadingEmoji(activity.description[language])}</p>
          </div>
        </div>
        <div className="sport-chip-row sport-sheet-chips">
          <span>{cleanSportLabel(meta.sportType || activity.activity[language])}</span>
          <span>{sportLevelLabel(meta.level, language)}</span>
          <span>{sportEnvironmentLabel(meta.environment, language)}</span>
          <span>{meta.durationMinutes || 90} {t.minutesShort}</span>
        </div>
        <div className="detail-list sport-detail-list sport-priority-grid" style={{ borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <div className="sport-date-row calendar-date-action" onClick={() => onCalendar(activity)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onCalendar(activity); } }} role="button" tabIndex={0} aria-label={t.addToGoogleCalendar}><CalendarDays /><span>{dateLabel(activity.date, language)}</span>{formatEventTime(activity.time) ? <strong>{formatEventTime(activity.time)}</strong> : null}</div>
          <button className="detail-members-toggle sport-detail-members-row" onClick={() => setMembersOpen((open: boolean) => !open)} type="button" aria-expanded={membersOpen}>
            <UsersRound />
            <span>{t.participants}</span>
            <strong>{participantCount} / {activity.capacity}</strong>
            <ChevronRight className={membersOpen ? "open" : ""} />
          </button>
          <div className="sport-location-row"><MapPin /><a className="sport-location-block" href={activity.locationUrl || sportMapSearchUrl || "#"} target="_blank" rel="noreferrer"><span className="sport-location-city">{cityName}</span>{addressLines.map((line, index) => <span className="sport-location-address" key={`${line}-${index}`}>{line}</span>)}</a></div>
          {showWeather ? (
            <button className="weather-detail-toggle weather-summary-toggle" onClick={() => setWeatherDetailsOpen((open) => !open)} type="button" aria-label={t.weatherHint}>
              <strong className="weather-summary-lines">{weather ? weatherSummaryLines(weather) : weatherText}</strong>
            </button>
          ) : (
            <div className="sport-priority-organizer sport-priority-organizer-inline">
              <OrganizerDetailAction organizerKey={activity.organizerKey} organizerName={activity.organizer} label={t.organizer} />
            </div>
          )}
          {showWeather && (
            <div className="sport-priority-organizer sport-priority-organizer-below">
              <OrganizerDetailAction organizerKey={activity.organizerKey} organizerName={activity.organizer} label={t.organizer} />
            </div>
          )}
          {meta.format && <div><ShieldCheck /><span>{t.sportFormat}</span><strong>{sportFormatLabel(meta.format, language)}</strong></div>}
          {activity.price > 0 && <div><Ticket /><span>{t.price}</span><strong>{activity.price} Kč</strong></div>}
          {meta.equipmentNeeded && <div><ShieldCheck /><span>{t.sportEquipmentNeeded}</span><strong>{t.yes}</strong></div>}
          {meta.equipment && <div><Sparkles /><span>{t.sportEquipment}</span><strong>{meta.equipment}</strong></div>}
          {meta.bring && <div className="sport-bring-row"><Sparkles /><span>{t.sportBring}</span><strong>{meta.bring}</strong></div>}
          {meta.requirements && <div><ShieldCheck /><span>{t.sportRequirements}</span><strong>{meta.requirements}</strong></div>}
          {meta.organizerTips && <div className="sport-organizer-tips-row"><CircleUserRound /><span>{t.sportOrganizerTips}</span><strong>{meta.organizerTips}</strong></div>}
        </div>
        {showWeather && weatherDetailsOpen && weatherHours.length > 0 && (
          <section className="weather-detail-card" aria-label={t.weatherDetails}>
            <div className="weather-detail-head">
              <span>{t.weatherDetails}</span>
              <strong>{weather ? weatherSummaryText(weather) : weatherText}</strong>
            </div>
            <div className="weather-bars">
              {weatherHours.map((hour) => (
                <div className="weather-bar-row" key={hour.time}>
                  <span className="weather-hour-time"><b aria-hidden="true">{hour.icon}</b>{hour.time.slice(11, 16)}</span>
                  <span className="weather-hour-metric"><Thermometer aria-hidden="true" /><span>{hour.temperature}°C</span></span>
                  <span className="weather-hour-metric"><Umbrella aria-hidden="true" /><span>{hour.rain}%</span></span>
                  <span className="weather-hour-metric"><Wind aria-hidden="true" /><span>{hour.wind} km/h</span></span>
                </div>
              ))}
            </div>
          </section>
        )}

        {membersOpen && (
          <div className="members-popover-backdrop" onMouseDown={() => setMembersOpen(false)}>
            <div className="members-section members-popover" role="dialog" aria-modal="true" aria-label={t.participants} onMouseDown={(event) => event.stopPropagation()}>
              <button className="members-popover-close" onClick={() => setMembersOpen(false)} type="button" aria-label={t.close}><X /></button>
              <div className="members-list">
              {joinedMembers.map((member) => (
                <ParticipantProfileAction key={member.userKey} userKey={member.userKey} name={member.name} trailing={<UsersRound />} />
              ))}
              {!joinedMembers.length && <p>{t.noParticipants}</p>}
              {waitingMembers.length > 0 && <div className="waiting-heading">{t.waitingList} · {waitingMembers.length}</div>}
              {waitingMembers.map((member) => (
                <ParticipantProfileAction key={member.userKey} userKey={member.userKey} name={member.name} trailing={<Clock3 />} />
              ))}
              {canManageActivity && pendingMembers.length > 0 && <div className="pending-heading">{t.requests} · {pendingMembers.length}</div>}
              {canManageActivity && pendingMembers.map((member) => (
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

        <section className="sport-community-block">
          <ActivityChatPanel activity={activity} openRequest={chatOpenRequest} showHelperAction={false} />
        </section>

        {interaction.showHelperAction ? <CoachRequestPanel activity={activity} userRole={userRole} /> : null}

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
        {canDelete && <button className="danger-action" onClick={() => onDelete(activity)} type="button"><Trash2 size={18} />{t.delete}</button>}
        <button className="telegram-close-button compact" onClick={onCloseMiniApp} type="button">{t.backToTelegram}</button>
      </article>
    </div>
  );
}
