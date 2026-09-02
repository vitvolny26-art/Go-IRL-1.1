import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Link2, MessageCircle, Trash2, UsersRound } from "lucide-react";
import { getCurrentChatIdentity } from "../activityChatFeature";
import { getCity } from "../config/cities";
import {
  canAccessExternalTelegramChat,
  loadLocalEventTelegramChatLink,
  openExternalTelegramChat,
  removeLocalEventTelegramChatLink,
  resolveExternalTelegramChatLifecycle,
  type ExternalTelegramChatLink,
} from "../externalTelegramChat";
import {
  loadSharedEventTelegramChatLink,
  removeSharedEventTelegramChatLink,
} from "../externalTelegramChatRepository";
import { getStoredUiLanguage, uiLanguageChangedEvent, type UiLanguage } from "../i18n";
import { useAppStore } from "../store";
import { createCityEventForumTopic, createEventForumTopic } from "../telegramEventSupergroup";
import type { Activity } from "../types";
import "./external-telegram-chat.css";

type ExternalTelegramChatPanelProps = {
  activity: Activity;
  activityChatExists: boolean;
  activityChatReady: boolean;
  activityChatCreating: boolean;
  onCreateActivityChat: () => void;
};

type PublicCityChatCopy = {
  button: (cityName: string) => string;
  description: (cityName: string) => string;
};

const publicCityChatCopy: Record<UiLanguage, PublicCityChatCopy> = {
  ru: {
    button: (cityName) => `Открыть чат ${cityName}`,
    description: (cityName) => `Общий Telegram-чат GO IRL ${cityName} — общайся, задавай вопросы и узнавай о новых событиях города.`,
  },
  uk: {
    button: (cityName) => `Відкрити чат ${cityName}`,
    description: (cityName) => `Спільний Telegram-чат GO IRL ${cityName} — спілкуйся, став запитання та дізнавайся про нові події міста.`,
  },
  cs: {
    button: (cityName) => `Otevřít chat ${cityName}`,
    description: (cityName) => `Společný Telegram chat GO IRL ${cityName} — povídej si, ptej se a sleduj nové akce ve městě.`,
  },
  en: {
    button: (cityName) => `Open ${cityName} chat`,
    description: (cityName) => `GO IRL ${cityName} city Telegram chat — chat, ask questions and discover new events in the city.`,
  },
  pl: {
    button: (cityName) => `Otwórz czat ${cityName}`,
    description: (cityName) => `Miejski czat Telegram GO IRL ${cityName} — rozmawiaj, zadawaj pytania i poznawaj nowe wydarzenia w mieście.`,
  },
  sk: {
    button: (cityName) => `Otvoriť chat ${cityName}`,
    description: (cityName) => `Spoločný Telegram chat GO IRL ${cityName} — komunikuj, pýtaj sa a objavuj nové udalosti v meste.`,
  },
};

const organizerChannelCopy: Record<UiLanguage, {
  chat: string;
  topic: string;
  creatingChat: string;
  creatingTopic: string;
  setupNote: string;
}> = {
  ru: { chat: "Чат", topic: "Топик", creatingChat: "Создание чата…", creatingTopic: "Создание топика…", setupNote: "Для события можно создать тему GO IRL или выбрать существующий Telegram-чат." },
  uk: { chat: "Чат", topic: "Тема", creatingChat: "Створення чату…", creatingTopic: "Створення теми…", setupNote: "Для події можна створити тему GO IRL або вибрати наявний Telegram-чат." },
  cs: { chat: "Chat", topic: "Téma", creatingChat: "Vytváření chatu…", creatingTopic: "Vytváření tématu…", setupNote: "Pro událost můžete vytvořit téma GO IRL nebo vybrat existující Telegram chat." },
  en: { chat: "Chat", topic: "Topic", creatingChat: "Creating chat…", creatingTopic: "Creating topic…", setupNote: "You can create a GO IRL topic for the event or choose an existing Telegram chat." },
  pl: { chat: "Czat", topic: "Temat", creatingChat: "Tworzenie czatu…", creatingTopic: "Tworzenie tematu…", setupNote: "Dla wydarzenia możesz utworzyć temat GO IRL lub wybrać istniejący czat Telegram." },
  sk: { chat: "Chat", topic: "Téma", creatingChat: "Vytváranie chatu…", creatingTopic: "Vytváranie témy…", setupNote: "Pre udalosť môžete vytvoriť tému GO IRL alebo vybrať existujúci Telegram chat." },
};

const telegramLogoPath = "M9.78 18.65 10.06 14.42 17.74 7.5C18.08 7.19 17.67 7.04 17.22 7.31L7.74 13.3 3.64 12C2.76 11.75 2.75 11.14 3.84 10.7L19.81 4.54C20.54 4.21 21.24 4.72 20.96 5.84L18.24 18.65C18.05 19.56 17.5 19.78 16.77 19.36L12.64 16.31 10.65 18.24C10.42 18.46 10.24 18.65 9.78 18.65Z";

const TelegramLogo = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d={telegramLogoPath} />
  </svg>
);

const eventEndsAt = (activity: Activity) => {
  const isSport = activity.type === "sport" || Boolean(activity.metadata?.sport);
  const durationMinutes = isSport ? activity.metadata?.sport?.durationMinutes || 90 : 120;
  const start = new Date(`${activity.date}T${activity.time || "00:00"}:00`);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
};

const safeTopicErrorCodes = new Set([
  "activity_id_required",
  "trusted_auth_required",
  "telegram_event_supergroup_forum_required",
  "telegram_get_chat_failed",
  "telegram_create_chat_invite_link_failed",
  "telegram_create_forum_topic_failed",
  "event_forum_topic_failed",
  "invalid_event_forum_topic_response",
]);

const topicErrorMessage = (error: unknown) => {
  const code = error instanceof Error && safeTopicErrorCodes.has(error.message) ? error.message : null;
  return code
    ? `Не удалось создать тему события в Telegram (${code})`
    : "Не удалось создать тему события в Telegram";
};

export function ExternalTelegramChatPanel({
  activity,
  activityChatExists,
  activityChatReady,
  activityChatCreating,
  onCreateActivityChat,
}: ExternalTelegramChatPanelProps) {
  const appLanguage = useAppStore((state) => state.language);
  const [identityKey, setIdentityKey] = useState<string | null>(null);
  const [link, setLink] = useState<ExternalTelegramChatLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uiLanguage, setPanelUiLanguage] = useState<UiLanguage>(() => getStoredUiLanguage(appLanguage));
  const refreshInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    void getCurrentChatIdentity()
      .then((identity) => {
        if (active) setIdentityKey(identity.userKey);
      })
      .catch(() => {
        if (active) setIdentityKey(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setPanelUiLanguage(getStoredUiLanguage(appLanguage));
  }, [appLanguage]);

  useEffect(() => {
    const handleUiLanguageChange = (event: Event) => {
      const nextLanguage = (event as CustomEvent<UiLanguage>).detail;
      if (nextLanguage) setPanelUiLanguage(nextLanguage);
    };
    window.addEventListener(uiLanguageChangedEvent, handleUiLanguageChange);
    return () => window.removeEventListener(uiLanguageChangedEvent, handleUiLanguageChange);
  }, []);

  const refresh = useCallback(async (showLoading = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (showLoading) setLoading(true);
    try {
      const next = await loadSharedEventTelegramChatLink(activity.id);
      setLink(next || loadLocalEventTelegramChatLink(activity.id));
      setError("");
    } catch {
      setLink(loadLocalEventTelegramChatLink(activity.id));
      setError("Общая синхронизация Telegram-чата пока недоступна");
    } finally {
      refreshInFlight.current = false;
      if (showLoading) setLoading(false);
    }
  }, [activity.id]);

  useEffect(() => {
    setError("");
    void refresh(true);
  }, [refresh]);

  const membershipStatus = useMemo(
    () => activity.members.find((member) => member.userKey === identityKey)?.status || null,
    [activity.members, identityKey],
  );
  const isOrganizer = Boolean(identityKey && identityKey === activity.organizerKey);
  const canAccess = canAccessExternalTelegramChat({
    currentUserKey: identityKey,
    organizerUserKey: activity.organizerKey,
    membershipStatus,
  });
  const lifecycle = resolveExternalTelegramChatLifecycle({
    kind: "event",
    eventEndsAt: eventEndsAt(activity),
    keepArchive: link?.keepArchive,
  });
  const canOpen = Boolean(link && canAccess && lifecycle === "active" && !link.topicDeletedAt);
  const busy = saving || activityChatCreating;
  const city = getCity(activity.cityId);
  const cityCommunityUrl = activity.visibility === "public"
    ? city.telegramCommunity?.url || null
    : null;
  const cityDisplayName = city.name[uiLanguage];
  const cityChatCopy = publicCityChatCopy[uiLanguage];
  const organizerCopy = organizerChannelCopy[uiLanguage];
  const isPublicCityViewer = Boolean(!isOrganizer && cityCommunityUrl);

  const createTopic = async () => {
    if (!isOrganizer || saving || activityChatCreating) return;
    setSaving(true);
    setError("");
    try {
      if (activity.visibility === "public" && link) {
        await createCityEventForumTopic(activity.id);
      } else {
        await createEventForumTopic(activity.id);
      }
      await refresh(false);
    } catch (error) {
      setError(topicErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isOrganizer || saving || activityChatCreating) return;
    setSaving(true);
    setError("");
    try {
      await removeSharedEventTelegramChatLink(activity.id);
      removeLocalEventTelegramChatLink(activity.id);
      setLink(null);
    } catch {
      setError("Не удалось удалить привязку Telegram-чата");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="external-telegram-chat-panel"
      aria-label={isPublicCityViewer ? cityChatCopy.button(cityDisplayName) : "Telegram chat события"}
    >
      {!isPublicCityViewer && link ? (
        <div className="external-telegram-chat-head">
          <span className="external-telegram-chat-icon" aria-hidden="true"><Link2 size={18} /></span>
          <div>
            <strong>Telegram-чат события</strong>
            <small>Создайте тему в общей группе GO IRL или выберите существующий Telegram-чат.</small>
          </div>
        </div>
      ) : null}

      {loading ? <div className="external-telegram-chat-muted">Загрузка Telegram-темы…</div> : null}

      {!isPublicCityViewer && !loading && link && canAccess ? (
        <div className="external-telegram-chat-actions">
          {link.topicUrl ? (
            <button type="button" onClick={() => openExternalTelegramChat(link.topicUrl || "")} disabled={!canOpen || busy}>
              <ExternalLink size={17} aria-hidden="true" />
              Открыть тему события
            </button>
          ) : (
            <button type="button" onClick={() => openExternalTelegramChat(link.url)} disabled={!canOpen || busy}>
              <UsersRound size={17} aria-hidden="true" />
              {lifecycle === "active" ? "Вступить в группу" : "Доступ к событию закрыт"}
            </button>
          )}
          {isOrganizer && link.topicUrl ? (
            <button type="button" className="danger" onClick={() => void remove()} disabled={busy} aria-label="Удалить привязку Telegram-чата">
              <Trash2 size={17} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && cityCommunityUrl && (isPublicCityViewer || cityCommunityUrl !== link?.url) ? (
        <div className="external-telegram-chat-actions external-telegram-chat-actions--public-city">
          <button type="button" onClick={() => openExternalTelegramChat(cityCommunityUrl)}>
            <TelegramLogo />
            {cityChatCopy.button(cityDisplayName)}
          </button>
        </div>
      ) : null}

      {!loading && isOrganizer && activityChatReady && (!activityChatExists || !link?.topicUrl) ? (
        <div className="external-telegram-channel-setup" aria-label="Event communication setup">
          {!activityChatExists ? (
            <button type="button" onClick={onCreateActivityChat} disabled={busy}>
              <MessageCircle size={17} aria-hidden="true" />
              {activityChatCreating ? organizerCopy.creatingChat : organizerCopy.chat}
            </button>
          ) : null}
          {!link?.topicUrl ? (
            <button type="button" onClick={() => void createTopic()} disabled={busy}>
              <TelegramLogo />
              {saving ? organizerCopy.creatingTopic : organizerCopy.topic}
            </button>
          ) : null}
        </div>
      ) : null}

      {!isPublicCityViewer && !loading && link && !canAccess ? <div className="external-telegram-chat-muted">Telegram-тема доступна организатору и подтверждённым участникам.</div> : null}
      {error && !isPublicCityViewer ? <div className="external-telegram-chat-error">{error}</div> : null}
      <div className="external-telegram-chat-note">
        {isPublicCityViewer
          ? cityChatCopy.description(cityDisplayName)
          : link?.topicUrl
          ? "Тема доступна до 24 часов после окончания события. Затем она должна быть удалена автоматическим lifecycle worker."
          : link
          ? "Telegram-чат привязан к событию. Для публичного события городской чат подключается автоматически."
          : organizerCopy.setupNote}
      </div>
    </section>
  );
}
