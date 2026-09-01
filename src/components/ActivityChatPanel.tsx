import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, MessageCircle, Send, UserCheck } from "lucide-react";
import {
  ensureActivityChat,
  getCurrentChatIdentity,
  loadActivityChat,
  loadActivityChatMessages,
  sendActivityChatMessage,
} from "../activityChatFeature";
import {
  activityChatUnreadChangedEvent,
  latestVisibleActivityChatMessageAt,
  markActivityChatRead,
} from "../activityChatUnread";
import { getCity } from "../config/cities";
import { getEventWeather, type WeatherHour, type WeatherResult } from "../services/weather";
import type { Activity, ActivityChat, ActivityChatMessage } from "../types";
import { isOutdoorGenericActivity } from "../eventWeather";
import { getDemoCoachProfile, loadCoachRequestsForActivity } from "../coachFeature";
import {
  resolveConfirmedCoachPresentation,
  type ConfirmedCoachPresentation,
} from "../confirmedCoachPresentation";
import { ParticipantIdentityLabel } from "./ParticipantIdentityLabel";
import { ExternalTelegramChatPanel } from "./ExternalTelegramChatPanel";

type ActivityChatPanelProps = {
  activity: Activity;
  openRequest?: number;
  showHelperAction?: boolean;
};

type CoachRequestsChangedDetail = { activityId?: string };

const coachRequestsChangedEvent = "go-irl-coach-requests-changed";

const formatCloseTime = (value?: string | null) => {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

const weatherSummaryLines = (weather: WeatherResult) => [
  `🌡️ ${weather.temperature}°C`,
  `☔ ${weather.rain}%`,
  `💨 ${weather.wind} km/h`,
];

function OutdoorWeatherPanel({ activity }: { activity: Activity }) {
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [weatherHours, setWeatherHours] = useState<WeatherHour[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("Загрузка погоды…");
  const city = getCity(activity.cityId);
  const cityName = city?.name.ru || activity.cityId;

  useEffect(() => {
    let active = true;
    setStatus("Загрузка погоды…");
    setWeather(null);
    setWeatherHours([]);

    void getEventWeather({
      date: activity.date,
      time: activity.time,
      address: activity.address,
      city: cityName,
      durationMinutes: activity.metadata?.sport?.durationMinutes || 90,
    }).then((nextWeather) => {
      if (!active) return;
      setWeather(nextWeather);
      setWeatherHours(nextWeather?.hours || []);
      setStatus(nextWeather ? "" : "Прогноз недоступен");
    });

    return () => {
      active = false;
    };
  }, [activity.id, activity.date, activity.time, activity.address, cityName, activity.metadata?.sport?.durationMinutes]);

  return (
    <section className="generic-weather-card">
      <button className="weather-detail-toggle generic-weather-toggle" onClick={() => setOpen((current) => !current)} type="button">
        <span className="generic-weather-icon" aria-hidden="true">{weather?.icon || "🌤️"}</span>
        <span>Погода</span>
        <strong className="weather-summary-lines">
          {weather ? weatherSummaryLines(weather).map((line) => <span key={line}>{line}</span>) : status}
        </strong>
      </button>

      {open && weatherHours.length > 0 ? (
        <div className="weather-detail-card generic-weather-details">
          <div className="weather-detail-head">
            <span>Детали погоды</span>
            <strong>{weather ? weatherSummaryLines(weather).join(" · ") : status}</strong>
          </div>
          <div className="weather-bars">
            {weatherHours.map((hour) => (
              <div className="weather-bar-row" key={hour.time}>
                <span className="weather-hour-time"><b aria-hidden="true">{hour.icon}</b>{hour.time.slice(11, 16)}</span>
                <span className="weather-hour-metric">🌡️ {hour.temperature}°C</span>
                <span className="weather-hour-metric">☔ {hour.rain}%</span>
                <span className="weather-hour-metric">💨 {hour.wind} km/h</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ConfirmedCoachBesideChat({
  presentation,
}: {
  presentation: ConfirmedCoachPresentation;
}) {
  const coach = getDemoCoachProfile(presentation.coachProfileId || undefined);
  const initials = coach?.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CO";

  return (
    <section className="confirmed-coach-chat-card" aria-label={presentation.title}>
      <span className="confirmed-coach-chat-avatar" aria-hidden="true">{initials}</span>
      <div className="confirmed-coach-chat-copy">
        <span className="confirmed-coach-chat-status"><UserCheck size={15} aria-hidden="true" />{presentation.title}</span>
        <strong>{coach?.displayName || "Подтверждённый Sport Coach"}</strong>
        {coach?.city ? <small><MapPin size={13} aria-hidden="true" />{coach.city}</small> : null}
        <p>{presentation.supportCopy}</p>
      </div>
    </section>
  );
}

export function ActivityChatPanel({ activity, openRequest = 0, showHelperAction = true }: ActivityChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<ActivityChat | null>(null);
  const [messages, setMessages] = useState<ActivityChatMessage[]>([]);
  const [identityKey, setIdentityKey] = useState<string | null>(null);
  const [chatAvailabilityLoading, setChatAvailabilityLoading] = useState(true);
  const [creatingChat, setCreatingChat] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedCoach, setConfirmedCoach] = useState<ConfirmedCoachPresentation | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const showOutdoorWeather = isOutdoorGenericActivity(activity);
  const isOrganizer = Boolean(identityKey && identityKey === activity.organizerKey);

  const expired = useMemo(() => {
    if (!chat) return false;
    return chat.status !== "active" || new Date(chat.expiresAt).getTime() <= Date.now();
  }, [chat]);

  const reload = async () => {
    setLoading(true);
    setError(null);

    try {
      const nextChat = await loadActivityChat(activity.id);
      if (!nextChat) {
        setChat(null);
        setMessages([]);
        setOpen(false);
        return;
      }
      const [nextMessages, identity] = await Promise.all([
        loadActivityChatMessages(activity.id),
        getCurrentChatIdentity(),
      ]);

      setChat(nextChat);
      setMessages(nextMessages);
      setIdentityKey(identity.userKey);

      const latestMessageAt = latestVisibleActivityChatMessageAt(nextMessages);
      if (latestMessageAt && markActivityChatRead(activity.id, identity.userKey, latestMessageAt)) {
        window.dispatchEvent(new CustomEvent(activityChatUnreadChangedEvent, {
          detail: { activityId: activity.id },
        }));
      }
    } catch {
      setError("Чат доступен только участникам");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setChatAvailabilityLoading(true);
    setSetupError(null);
    void getCurrentChatIdentity()
      .then(async (identity) => {
        if (!active) return;
        setIdentityKey(identity.userKey);
        try {
          const nextChat = await loadActivityChat(activity.id);
          if (active) setChat(nextChat);
        } catch {
          if (active) setChat(null);
        }
      })
      .catch(() => {
        if (active) {
          setIdentityKey(null);
          setChat(null);
        }
      })
      .finally(() => {
        if (active) setChatAvailabilityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activity.id]);

  useEffect(() => {
    let active = true;

    const reloadConfirmedCoach = () => {
      void loadCoachRequestsForActivity(activity.id)
        .then((requests) => {
          if (active) setConfirmedCoach(resolveConfirmedCoachPresentation(requests));
        })
        .catch(() => {
          if (active) setConfirmedCoach(null);
        });
    };

    const handleCoachRequestsChanged = (event: Event) => {
      const detail = (event as CustomEvent<CoachRequestsChangedDetail>).detail;
      if (detail?.activityId && detail.activityId !== activity.id) return;
      reloadConfirmedCoach();
    };

    reloadConfirmedCoach();
    window.addEventListener(coachRequestsChangedEvent, handleCoachRequestsChanged);

    return () => {
      active = false;
      window.removeEventListener(coachRequestsChangedEvent, handleCoachRequestsChanged);
    };
  }, [activity.id]);

  useEffect(() => {
    if (!open || !chat) return;
    void reload();
  }, [activity.id, chat?.id, open]);

  useEffect(() => {
    if (!openRequest || !chat) return;
    setOpen(true);
    window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      inputRef.current?.focus({ preventScroll: true });
    });
  }, [activity.id, chat?.id, openRequest]);

  const handleCreateChat = async () => {
    if (!isOrganizer || creatingChat || chat) return;
    setCreatingChat(true);
    setSetupError(null);
    try {
      await ensureActivityChat(activity.id);
      const nextChat = await loadActivityChat(activity.id);
      if (!nextChat) throw new Error("chat_not_created");
      setChat(nextChat);
    } catch {
      setSetupError("Не удалось создать чат GO IRL");
    } finally {
      setCreatingChat(false);
    }
  };

  const handleSend = async () => {
    if (!body.trim()) return;

    setSending(true);
    setError(null);

    try {
      await sendActivityChatMessage(activity.id, body);
      setBody("");
      await reload();
    } catch {
      setError("Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {showOutdoorWeather ? <OutdoorWeatherPanel activity={activity} /> : null}
      {chat ? <section className="activity-chat-panel" ref={panelRef}>
        <button
          type="button"
          className="activity-chat-toggle"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          <span className="activity-chat-toggle-icon">
            <MessageCircle size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>Чат события</strong>
            <small>Для участников. Закроется через 24 часа после события.</small>
          </span>
        </button>

        {open ? (
          <div className="activity-chat-box">
            {loading ? <div className="activity-chat-muted">Загрузка чата…</div> : null}

            {chat?.expiresAt ? (
              <div className="activity-chat-muted">
                Чат закроется: {formatCloseTime(chat.expiresAt)}
              </div>
            ) : null}

            {expired ? (
              <div className="activity-chat-muted">Чат закрыт. Сообщения больше недоступны.</div>
            ) : null}

            {error ? <div className="activity-chat-error">{error}</div> : null}

            {!loading && !error ? (
              <div className="activity-chat-messages">
                {messages.length > 0 ? (
                  messages.map((message) => (
                    <article key={message.id} className="activity-chat-message">
                      <div className="activity-chat-message-meta">
                        <span className="activity-chat-sender">
                          <ParticipantIdentityLabel
                            userKey={message.senderUserKey}
                            snapshotName={message.senderDisplayName}
                            avatarClassName="activity-chat-sender-avatar"
                            nameClassName="activity-chat-sender-name"
                            nameTag="strong"
                          />
                        </span>
                        <span>{formatCloseTime(message.createdAt)}</span>
                      </div>
                      <p>{message.body}</p>
                    </article>
                  ))
                ) : (
                  <div className="activity-chat-muted">Сообщений пока нет. Напишите первым.</div>
                )}
              </div>
            ) : null}

            {!expired && !error ? (
              <div className="activity-chat-form">
                <input
                  ref={inputRef}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Сообщение…"
                  maxLength={1000}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !body.trim()}
                  aria-label="Отправить"
                >
                  <Send size={18} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section> : null}
      {!chat && isOrganizer && setupError ? <div className="activity-chat-error">{setupError}</div> : null}
      <ExternalTelegramChatPanel
        activity={activity}
        activityChatExists={Boolean(chat)}
        activityChatReady={!chatAvailabilityLoading}
        activityChatCreating={creatingChat}
        onCreateActivityChat={() => void handleCreateChat()}
      />
      {showHelperAction && confirmedCoach ? <ConfirmedCoachBesideChat presentation={confirmedCoach} /> : null}
    </>
  );
}
