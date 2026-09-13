import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Bell, BellRing, Check, MessageCircle, Trash2 } from "lucide-react";
import { getCurrentChatIdentity, loadActivityChatMessages } from "../activityChatFeature";
import { activityChatUnreadChangedEvent, countUnreadActivityChatMessages, latestVisibleActivityChatMessageAt, loadActivityChatReadAt, markActivityChatRead } from "../activityChatUnread";
import { eventStartsAt, removeEventReminder, saveEventReminders, type EventReminderPreference, type ReminderChannel, type ReminderLeadMinutes } from "../reminderPreferences";
import { readLinkedReminderChannels, readServerEventReminders, removeServerEventReminder, replaceServerEventReminders, usesServerReminderPersistence } from "../reminders/server-preferences";
import { useAppStore } from "../store";

type Props = { activityId: string; date: string; time: string; label?: string };
const leadOptions: Array<{ value: ReminderLeadMinutes; label: string }> = [
  { value: 15, label: "За 15 минут" }, { value: 60, label: "За 1 час" },
  { value: 180, label: "За 3 часа" }, { value: 1440, label: "За 1 день" },
];
const channelLabel: Record<ReminderChannel, string> = {
  in_app: "GO IRL",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
};

const configuredReminderChannel = async (): Promise<ReminderChannel | null> =>
  (await readLinkedReminderChannels()).has("telegram") ? "telegram" : null;

export function CardReminderAction({ activityId, date, time, label = "Настроить напоминание" }: Props) {
  const serverBacked = usesServerReminderPersistence();
  const joined = useAppStore((state) => state.joinedIds.includes(activityId));
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<EventReminderPreference[]>([]);
  const [channel, setChannel] = useState<ReminderChannel | null>(null);
  const [leadMinutes, setLeadMinutes] = useState<Set<ReminderLeadMinutes>>(new Set([180]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const latestMessageAtRef = useRef<string | null>(null);

  const refreshUnread = useCallback(async () => {
    if (!joined) { setUnreadCount(0); return; }
    try {
      const [messages, identity] = await Promise.all([loadActivityChatMessages(activityId), getCurrentChatIdentity()]);
      latestMessageAtRef.current = latestVisibleActivityChatMessageAt(messages);
      setUnreadCount(countUnreadActivityChatMessages(messages, identity.userKey, loadActivityChatReadAt(activityId, identity.userKey)));
    } catch { latestMessageAtRef.current = null; setUnreadCount(0); }
  }, [activityId, joined]);

  useEffect(() => {
    void refreshUnread();
    const timer = window.setInterval(() => { if (!document.hidden) void refreshUnread(); }, 20_000);
    const handleRefresh = () => { void refreshUnread(); };
    window.addEventListener("focus", handleRefresh);
    window.addEventListener(activityChatUnreadChangedEvent, handleRefresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", handleRefresh); window.removeEventListener(activityChatUnreadChangedEvent, handleRefresh); };
  }, [refreshUnread]);

  useEffect(() => {
    if (!serverBacked) return;
    let active = true;
    Promise.all([readServerEventReminders(activityId), configuredReminderChannel()]).then(([serverReminders, currentChannel]) => {
      if (!active) return;
      setChannel(currentChannel);
      if (serverReminders.length) {
        saveEventReminders(serverReminders);
        setSaved(serverReminders);
        setLeadMinutes(new Set(serverReminders.map((item) => item.leadMinutes)));
      } else {
        removeEventReminder(activityId);
        setSaved([]);
        setLeadMinutes(new Set([180]));
      }
    }).catch(() => { if (active) setError("Не удалось загрузить настройки напоминания."); });
    return () => { active = false; };
  }, [activityId, serverBacked]);

  useEffect(() => {
    if (!open) return;
    void configuredReminderChannel().then(setChannel).catch(() => undefined);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  const openUnreadChat = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation();
    void getCurrentChatIdentity().then((identity) => {
      const latest = latestMessageAtRef.current;
      if (!latest || !markActivityChatRead(activityId, identity.userKey, latest)) return;
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent(activityChatUnreadChangedEvent, { detail: { activityId } }));
    });
    event.currentTarget.closest("article")?.querySelector<HTMLButtonElement>(".activity-card-footer .sport-coach-action")?.click();
  };

  const toggleLead = (value: ReminderLeadMinutes) => setLeadMinutes((current) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });

  const save = async () => {
    const selected = Array.from(leadMinutes).sort((a, b) => a - b);
    setSaving(true); setError("");
    try {
      if (!serverBacked) throw new Error("trusted_auth_required");
      const currentChannel = await configuredReminderChannel();
      if (!currentChannel) throw new Error("telegram_required");
      if (!selected.length) {
        await removeServerEventReminder(activityId);
        removeEventReminder(activityId);
        setSaved([]);
        setOpen(false);
        return;
      }
      await replaceServerEventReminders(activityId, currentChannel, selected);
      const now = new Date().toISOString();
      const preferences = selected.map((lead) => ({ activityId, channel: currentChannel, leadMinutes: lead, eventStartsAt: eventStartsAt(date, time), updatedAt: now }));
      saveEventReminders(preferences);
      setChannel(currentChannel);
      setSaved(preferences);
      setOpen(false);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "";
      setError(message.includes("telegram_required") || message.includes("provider_not_linked")
        ? "Подключите Telegram, чтобы получать напоминания об активностях."
        : message.includes("reminder_time_passed")
          ? "Один из выбранных сроков уже прошёл. Уберите его и сохраните снова."
          : "Не удалось сохранить напоминания. Попробуйте ещё раз.");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    setSaving(true); setError("");
    try {
      if (!serverBacked) throw new Error("trusted_auth_required");
      await removeServerEventReminder(activityId);
      removeEventReminder(activityId);
      setSaved([]);
      setLeadMinutes(new Set());
      setOpen(false);
    } catch { setError("Не удалось удалить напоминания. Попробуйте ещё раз."); }
    finally { setSaving(false); }
  };

  const panel = open ? <span ref={panelRef} className="card-reminder-panel card-reminder-panel-portal" role="dialog" aria-label={label} onClick={(event) => event.stopPropagation()}>
    <strong>Напомнить о событии</strong>
    <span className="card-reminder-info">Канал: {channel ? channelLabel[channel] : "подключите Telegram"}</span>
    <span className="card-reminder-leads">{leadOptions.map((option) => <button className={leadMinutes.has(option.value) ? "is-selected" : ""} type="button" key={option.value} aria-pressed={leadMinutes.has(option.value)} onClick={() => toggleLead(option.value)}>{option.label}{leadMinutes.has(option.value) ? <Check aria-hidden="true" /> : null}</button>)}</span>
    {!serverBacked ? <span className="card-reminder-info">Войдите в GO IRL, чтобы получать напоминания.</span> : null}
    {error ? <span className="card-reminder-error" role="alert">{error}</span> : null}
    <button className="card-reminder-save" type="button" disabled={saving || !serverBacked || !channel} onClick={save}>{saving ? "Сохраняем…" : leadMinutes.size ? `Сохранить напоминания (${leadMinutes.size})` : "Выключить напоминания"}</button>
    {saved.length ? <button className="card-reminder-remove" type="button" disabled={saving} onClick={remove}><Trash2 aria-hidden="true" /> Выключить напоминания</button> : null}
  </span> : null;

  return <>
    {joined && unreadCount > 0 ? <button className="event-request-alert event-chat-unread-alert" type="button" aria-label={`Новых сообщений: ${unreadCount}`} onClick={openUnreadChat}><MessageCircle aria-hidden="true" /><span>{unreadCount > 99 ? "99+" : unreadCount}</span></button> : null}
    <span className="card-reminder-action" data-activity-id={activityId} ref={rootRef}><button className={saved.length ? "sport-card-icon-action is-reminder-active" : "sport-card-icon-action"} type="button" aria-label={label} aria-expanded={open} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value); }}>{saved.length ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}</button></span>
    {panel ? createPortal(panel, document.body) : null}
  </>;
}
