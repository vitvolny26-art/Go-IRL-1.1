import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Link2, RefreshCw, Trash2, UsersRound } from "lucide-react";
import { getCurrentChatIdentity } from "../activityChatFeature";
import {
  canAccessExternalTelegramChat,
  loadLocalEventTelegramChatLink,
  normalizeExternalTelegramChatUrl,
  openExternalTelegramChat,
  removeLocalEventTelegramChatLink,
  resolveExternalTelegramChatLifecycle,
  saveLocalEventTelegramChatLink,
  type ExternalTelegramChatLink,
} from "../externalTelegramChat";
import {
  loadSharedEventTelegramChatLink,
  removeSharedEventTelegramChatLink,
  saveSharedEventTelegramChatLink,
} from "../externalTelegramChatRepository";
import {
  createEventSupergroupBinding,
  getEventSupergroupWebhookInfo,
  openEventSupergroupBinding,
  setEventSupergroupWebhook,
  type EventSupergroupWebhookInfo,
} from "../telegramEventSupergroup";
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
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState(false);
  const [awaitingBinding, setAwaitingBinding] = useState(false);
  const [bindingExpiresAt, setBindingExpiresAt] = useState<string | null>(null);
  const [webhookDiagnostic, setWebhookDiagnostic] = useState<EventSupergroupWebhookInfo | null>(null);
  const [diagnosingWebhook, setDiagnosingWebhook] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
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
      const fallback = next || loadLocalEventTelegramChatLink(activity.id);
      setLink(fallback);
      setDraft(fallback?.url || "");
      setShared(Boolean(next));
      if (next?.verificationState === "verified") {
        setAwaitingBinding(false);
        setBindingExpiresAt(null);
        setWebhookDiagnostic(null);
        setError("");
      }
    } catch {
      const fallback = loadLocalEventTelegramChatLink(activity.id);
      setLink(fallback);
      setDraft(fallback?.url || "");
      setShared(false);
      setError("Общая синхронизация Telegram-чата пока недоступна");
    } finally {
      refreshInFlight.current = false;
      if (showLoading) setLoading(false);
    }
  }, [activity.id]);

  useEffect(() => {
    setEditing(false);
    setError("");
    setAwaitingBinding(false);
    setBindingExpiresAt(null);
    setWebhookDiagnostic(null);
    setDiagnosingWebhook(false);
    setSettingWebhook(false);
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (!awaitingBinding) return;
    const expiresAt = bindingExpiresAt ? new Date(bindingExpiresAt).getTime() : Number.POSITIVE_INFINITY;
    const check = () => {
      if (Date.now() >= expiresAt) {
        setAwaitingBinding(false);
        setBindingExpiresAt(null);
        setWebhookDiagnostic(null);
        setError("Время привязки истекло. Запустите привязку ещё раз.");
        return;
      }
      void refresh(false);
    };
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(check, 5_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [awaitingBinding, bindingExpiresAt, refresh]);

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
  const canOpen = Boolean(link && canAccess && lifecycle === "active");
  const verified = link?.verificationState === "verified";

  const createGroup = async () => {
    if (!isOrganizer || saving) return;
    setSaving(true);
    setError("");
    setWebhookDiagnostic(null);
    try {
      const binding = await createEventSupergroupBinding(activity.id);
      if (!openEventSupergroupBinding(binding.startGroupUrl)) throw new Error("telegram_not_opened");
      setBindingExpiresAt(binding.expiresAt);
      setAwaitingBinding(true);
    } catch {
      setError("Не удалось подготовить автоматическую привязку Telegram-группы");
    } finally {
      setSaving(false);
    }
  };

  const diagnoseWebhook = async () => {
    if (!isOrganizer || diagnosingWebhook) return;
    setDiagnosingWebhook(true);
    setError("");
    try {
      const diagnostic = await getEventSupergroupWebhookInfo(activity.id);
      setWebhookDiagnostic(diagnostic);
    } catch {
      setWebhookDiagnostic(null);
      setError("Не удалось получить безопасную диагностику Telegram webhook");
    } finally {
      setDiagnosingWebhook(false);
    }
  };

  const setupWebhook = async () => {
    if (!isOrganizer || settingWebhook) return;
    setSettingWebhook(true);
    setError("");
    try {
      const diagnostic = await setEventSupergroupWebhook(activity.id);
      setWebhookDiagnostic(diagnostic);
    } catch {
      try {
        const diagnostic = await getEventSupergroupWebhookInfo(activity.id);
        setWebhookDiagnostic(diagnostic);
      } catch {
        // Preserve the last safe diagnostic if Telegram setup failed and refresh is unavailable.
      }
      setError("Не удалось настроить Telegram webhook. Текущий статус показан ниже.");
    } finally {
      setSettingWebhook(false);
    }
  };

  const save = async (value = draft) => {
    if (!identityKey || !isOrganizer || saving) return;
    const normalized = normalizeExternalTelegramChatUrl(value);
    if (!normalized) {
      setError("Добавьте корректную ссылку t.me на группу или приглашение");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const next = await saveSharedEventTelegramChatLink(activity.id, normalized, identityKey, link?.keepArchive);
      if (!next) throw new Error("telegram_chat_not_saved");
      saveLocalEventTelegramChatLink(activity.id, next.url, identityKey);
      setLink(next);
      setDraft(next.url);
      setShared(true);
      setEditing(false);
      setAwaitingBinding(false);
      setBindingExpiresAt(null);
      setWebhookDiagnostic(null);
    } catch {
      setError("Не удалось сохранить Telegram-чат для участников");
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
      setDraft("");
      setShared(false);
      setEditing(false);
      setAwaitingBinding(false);
      setBindingExpiresAt(null);
      setWebhookDiagnostic(null);
    } catch {
      setError("Не удалось удалить Telegram-чат");
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
          <small>Привяжите существующую Telegram-группу, чтобы подтверждённые участники получили доступ.</small>
        </div>
      </div>

      {loading ? <div className="external-telegram-chat-muted">Загрузка Telegram-чата…</div> : null}

      {!loading && link && canAccess ? (
        <div className="external-telegram-chat-actions">
          <button type="button" onClick={() => openExternalTelegramChat(link.url)} disabled={!canOpen || saving}>
            <ExternalLink size={17} aria-hidden="true" />
            {lifecycle === "active" ? "Открыть Telegram-чат" : "Telegram-чат закрыт"}
          </button>
          {isOrganizer ? (
            <>
              <button type="button" className="secondary" onClick={() => setEditing(true)} disabled={saving}>Изменить</button>
              <button type="button" className="danger" onClick={() => void remove()} disabled={saving} aria-label="Удалить ссылку на Telegram-чат">
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {!loading && isOrganizer && (!link || editing || !shared) ? (
        <div className="external-telegram-chat-editor">
          {!link ? (
            <>
              <div className="external-telegram-chat-steps">
                <strong>Если группы ещё нет:</strong>
                <span>1. Создайте её вручную в Telegram.</span>
                <span>2. Вернитесь сюда и выберите эту группу.</span>
                <span>3. Подтвердите добавление GO IRL bot.</span>
              </div>
              <button type="button" onClick={() => void createGroup()} disabled={saving}>
                <UsersRound size={17} aria-hidden="true" />
                {awaitingBinding ? "Выбрать другую группу" : "Привязать существующую группу"}
              </button>
              {awaitingBinding ? (
                <>
                  <button type="button" className="secondary" onClick={() => void refresh(true)} disabled={saving}>
                    <RefreshCw size={17} aria-hidden="true" />
                    Проверить привязку
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void diagnoseWebhook()}
                    disabled={saving || diagnosingWebhook || settingWebhook}
                  >
                    <RefreshCw size={17} aria-hidden="true" />
                    {diagnosingWebhook ? "Проверка webhook…" : "Диагностика webhook"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void setupWebhook()}
                    disabled={saving || diagnosingWebhook || settingWebhook}
                  >
                    <RefreshCw size={17} aria-hidden="true" />
                    {settingWebhook ? "Настройка webhook…" : "Настроить webhook"}
                  </button>
                  {webhookDiagnostic ? (
                    <div className="external-telegram-chat-muted" data-testid="telegram-webhook-diagnostic">
                      <div
                        className={`external-telegram-chat-webhook-status ${webhookDiagnostic.url ? "is-configured" : "is-missing"}`}
                      >
                        Webhook: {webhookDiagnostic.url ? "настроен" : "не настроен"}
                      </div>
                      <div>Webhook URL: {webhookDiagnostic.url || "не настроен"}</div>
                      <div>pending_update_count: {webhookDiagnostic.pending_update_count}</div>
                      <div>last_error_date: {webhookDiagnostic.last_error_date ?? "нет"}</div>
                      <div>last_error_message: {webhookDiagnostic.last_error_message || "нет"}</div>
                      <div>max_connections: {webhookDiagnostic.max_connections ?? "не задано"}</div>
                      <div>
                        allowed_updates: {webhookDiagnostic.allowed_updates.length
                          ? webhookDiagnostic.allowed_updates.join(", ")
                          : "не ограничены"}
                      </div>
                    </div>
                  ) : null}
                  {webhookDiagnostic?.url ? (
                    <div className="external-telegram-chat-muted">
                      Webhook настроен. Если текущая привязка началась до настройки, выберите группу заново.
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="external-telegram-chat-muted">
                Telegram покажет только существующие группы. Новую группу нужно сначала создать вручную.
              </div>
            </>
          ) : null}
          <details className="external-telegram-chat-fallback" open={editing}>
            <summary>Привязать по пригласительной ссылке</summary>
            <div className="external-telegram-chat-fallback-controls">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="https://t.me/+..."
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={saving}
              />
              <button type="button" className="secondary" onClick={() => void save()} disabled={saving}>
                {saving ? "Сохранение…" : "Сохранить ручную ссылку"}
              </button>
              {editing ? <button type="button" className="secondary" disabled={saving} onClick={() => { setEditing(false); setDraft(link?.url || ""); setError(""); }}>Отмена</button> : null}
            </div>
          </details>
        </div>
      ) : null}

      {!loading && !isOrganizer && !link ? <div className="external-telegram-chat-muted">Организатор ещё не добавил Telegram-чат.</div> : null}
      {!loading && link && !canAccess ? <div className="external-telegram-chat-muted">Telegram-чат доступен организатору и подтверждённым участникам.</div> : null}
      {error ? <div className="external-telegram-chat-error">{error}</div> : null}
      <div className="external-telegram-chat-note">
        {verified
          ? "Группа проверена GO IRL bot и синхронизирована для участников."
          : shared
            ? "Ручная ссылка синхронизирована, но Telegram-группа не проверена GO IRL bot."
            : "Локальная ссылка видна только на этом устройстве, пока организатор не сохранит её для участников."}
      </div>
    </section>
  );
}
