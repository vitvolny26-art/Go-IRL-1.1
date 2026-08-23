import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Link2, Trash2, UsersRound } from "lucide-react";
import { getCurrentChatIdentity } from "../activityChatFeature";
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
import { createEventForumTopic } from "../telegramEventSupergroup";
import type { Activity } from "../types";
import "./external-telegram-chat.css";

type ExternalTelegramChatPanelProps = {
  activity: Activity;
};

const eventEndsAt = (activity: Activity) => {
  const durationMinutes = activity.metadata?.sport?.durationMinutes || 90;
  const start = new Date(`${activity.date}T${activity.time || "00:00"}:00`);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + durationMinutes * 60_000).toISOString();
};

export function ExternalTelegramChatPanel({ activity }: ExternalTelegramChatPanelProps) {
  const [identityKey, setIdentityKey] = useState<string | null>(null);
  const [link, setLink] = useState<ExternalTelegramChatLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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

  const createTopic = async () => {
    if (!isOrganizer || saving) return;
    setSaving(true);
    setError("");
    try {
      await createEventForumTopic(activity.id);
      await refresh(false);
    } catch {
      setError("Не удалось создать тему события в Telegram");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isOrganizer || saving) return;
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
    <section className="external-telegram-chat-panel" aria-label="Telegram chat события">
      <div className="external-telegram-chat-head">
        <span className="external-telegram-chat-icon" aria-hidden="true"><Link2 size={18} /></span>
        <div>
          <strong>Telegram-тема события</strong>
          <small>Для события используется отдельная тема в общей группе GO IRL.</small>
        </div>
      </div>

      {loading ? <div className="external-telegram-chat-muted">Загрузка Telegram-темы…</div> : null}

      {!loading && link && canAccess ? (
        <div className="external-telegram-chat-actions">
          <button type="button" onClick={() => openExternalTelegramChat(link.url)} disabled={!canOpen || saving}>
            <UsersRound size={17} aria-hidden="true" />
            {lifecycle === "active" ? "Вступить в группу" : "Доступ к событию закрыт"}
          </button>
          {link.topicUrl ? (
            <button type="button" className="secondary" onClick={() => openExternalTelegramChat(link.topicUrl || "")} disabled={!canOpen || saving}>
              <ExternalLink size={17} aria-hidden="true" />
              Открыть тему события
            </button>
          ) : (
            <button type="button" className="secondary" onClick={() => openExternalTelegramChat(link.url)} disabled={!canOpen || saving}>
              <ExternalLink size={17} aria-hidden="true" />
              Открыть Telegram-чат
            </button>
          )}
          {isOrganizer ? (
            <button type="button" className="danger" onClick={() => void remove()} disabled={saving} aria-label="Удалить привязку Telegram-чата">
              <Trash2 size={17} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && isOrganizer && !link ? (
        <div className="external-telegram-chat-editor">
          <div className="external-telegram-chat-steps">
            <strong>Общая группа GO IRL уже настроена.</strong>
            <span>Создайте отдельную тему для этого события одной кнопкой.</span>
            <span>Подтверждённые участники автоматически увидят доступ к группе и теме.</span>
          </div>
          <button type="button" onClick={() => void createTopic()} disabled={saving}>
            <UsersRound size={17} aria-hidden="true" />
            {saving ? "Создание темы…" : "Создать тему в Telegram"}
          </button>
        </div>
      ) : null}

      {!loading && !isOrganizer && !link ? <div className="external-telegram-chat-muted">Организатор ещё не создал Telegram-тему события.</div> : null}
      {!loading && link && !canAccess ? <div className="external-telegram-chat-muted">Telegram-тема доступна организатору и подтверждённым участникам.</div> : null}
      {error ? <div className="external-telegram-chat-error">{error}</div> : null}
      <div className="external-telegram-chat-note">
        {link?.topicUrl
          ? "Тема доступна до 24 часов после окончания события. Затем она должна быть удалена автоматическим lifecycle worker."
          : "Старые Telegram-привязки продолжают открываться, но новые события используют темы общей группы GO IRL."}
      </div>
    </section>
  );
}