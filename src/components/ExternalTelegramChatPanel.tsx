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
import { requestTelegramChat } from "../telegram";
import { createCityEventForumTopic, createEventForumTopic, prepareEventChatPicker } from "../telegramEventSupergroup";
import type { Activity } from "../types";
import "./external-telegram-chat.css";

type ExternalTelegramChatPanelProps = {
  activity: Activity;
};

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

export function ExternalTelegramChatPanel({ activity }: ExternalTelegramChatPanelProps) {
  const [identityKey, setIdentityKey] = useState<string | null>(null);
  const [link, setLink] = useState<ExternalTelegramChatLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectingExisting, setSelectingExisting] = useState(false);
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
  const busy = saving || selectingExisting;

  const createTopic = async () => {
    if (!isOrganizer || saving || selectingExisting) return;
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

  const selectExistingChat = async () => {
    if (!isOrganizer || saving || selectingExisting) return;
    setSelectingExisting(true);
    setError("");
    try {
      const picker = await prepareEventChatPicker(activity.id);
      const sent = await requestTelegramChat(picker.preparedButtonId);
      if (!sent) {
        setError("Выбор Telegram-чата отменён");
        return;
      }

      const expiresAt = new Date(picker.expiresAt).getTime();
      for (let attempt = 0; attempt < 8 && Date.now() < expiresAt; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_250));
        try {
          const next = await loadSharedEventTelegramChatLink(activity.id);
          if (next?.verificationState === "verified") {
            setLink(next);
            setError("");
            return;
          }
        } catch {
          // The webhook may still be completing; retry within this bounded picker window.
        }
      }
      setError("Чат выбран, но привязка не завершена. Для закрытого чата добавьте GO IRL bot или дайте ему доступ к действующей invite-ссылке и выберите чат снова.");
    } catch (error) {
      setError(error instanceof Error && error.message === "telegram_chat_picker_unsupported"
        ? "Обновите Telegram: выбор существующего чата требует Telegram Mini Apps 9.6+"
        : "Не удалось открыть выбор существующего Telegram-чата");
    } finally {
      setSelectingExisting(false);
    }
  };

  const remove = async () => {
    if (!isOrganizer || saving || selectingExisting) return;
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
          <strong>Telegram-чат события</strong>
          <small>Создайте тему в общей группе GO IRL или выберите существующий Telegram-чат.</small>
        </div>
      </div>

      {loading ? <div className="external-telegram-chat-muted">Загрузка Telegram-темы…</div> : null}

      {!loading && link && canAccess ? (
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
          {isOrganizer && activity.visibility === "public" && !link.topicUrl ? (
            <button type="button" className="secondary" onClick={() => void createTopic()} disabled={busy}>
              <UsersRound size={17} aria-hidden="true" />
              {saving ? "Создание темы…" : "Создать тему события"}
            </button>
          ) : null}
          {isOrganizer && link.topicUrl ? (
            <button type="button" className="danger" onClick={() => void remove()} disabled={busy} aria-label="Удалить привязку Telegram-чата">
              <Trash2 size={17} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && isOrganizer && !link ? (
        <div className="external-telegram-chat-editor">
          <div className="external-telegram-chat-steps">
            <strong>Выберите Telegram-чат для события.</strong>
            <span>Можно автоматически создать отдельную тему в общей группе GO IRL.</span>
            <span>Или выбрать существующую группу напрямую в Telegram. Организатору не нужны права администратора этой группы.</span>
            <span>Подтверждённые участники автоматически увидят доступ к выбранному Telegram-чату.</span>
          </div>
          <button type="button" onClick={() => void createTopic()} disabled={busy}>
            <UsersRound size={17} aria-hidden="true" />
            {saving ? "Создание темы…" : "Создать тему в Telegram"}
          </button>
          <button type="button" className="secondary" onClick={() => void selectExistingChat()} disabled={busy}>
            <Link2 size={17} aria-hidden="true" />
            {selectingExisting ? "Выбор чата…" : "Привязать существующий чат"}
          </button>
        </div>
      ) : null}

      {!loading && !isOrganizer && !link ? <div className="external-telegram-chat-muted">Организатор ещё не создал Telegram-тему события.</div> : null}
      {!loading && link && !canAccess ? <div className="external-telegram-chat-muted">Telegram-тема доступна организатору и подтверждённым участникам.</div> : null}
      {error ? <div className="external-telegram-chat-error">{error}</div> : null}
      <div className="external-telegram-chat-note">
        {link?.topicUrl
          ? "Тема доступна до 24 часов после окончания события. Затем она должна быть удалена автоматическим lifecycle worker."
          : link
          ? "Telegram-чат привязан к событию. Для публичного события городской чат подключается автоматически."
          : "Для события можно создать тему GO IRL или выбрать существующий Telegram-чат."}
      </div>
    </section>
  );
}
